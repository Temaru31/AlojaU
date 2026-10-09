"""POST /api/chat — chatbot AlojaU (MVP solo lectura).

- Auth OPCIONAL (`get_optional_user` de core.security: solo verifica claims,
  no escribe): con JWT válido se usa la identidad para el rate-limit; las
  tools SIEMPRE ven lo público (visitante). Sin token = anónimo.
- Kill switch: `CHAT_ENABLED=false` (default) responde controlado SIN tocar
  LLM ni BD. Sin `CHAT_DATABASE_URL` tampoco se abre sesión principal.
- Defensas: throttle por IP y por usuario, tope diario global + circuit
  breaker, topes de mensaje/historial, timeout al LLM, fallback en español.
- Logs: request_id, longitudes, tools usadas, latencia y resultado. NUNCA el
  texto del mensaje ni PII (logseguro).
"""
import time
import uuid

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.config import settings
from app.core.logseguro import una_linea
from app.core.security import get_optional_user
from app.db.chat_session import chat_configurado, get_chat_session
from app.services.chat import orchestrator
from app.services.chat.llm import FakeLLMProvider, HttpLLMProvider, LLMError
from app.services.chat.net import ip_cliente
from app.services.chat.prompts import FALLBACK_NO_DISPONIBLE
from app.services.chat.schemas import AccionOut, ChatIn, ChatOut, TarjetaOut
from app.services.chat.throttle import (
    limite_por_clave,
    registrar_exito_llm,
    registrar_fallo_llm,
    tope_diario,
)
import logging

logger = logging.getLogger("alojau.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _request_id(request: Request | None) -> str:
    try:
        rid = getattr(getattr(request, "state", None), "request_id", None)
        if rid:
            return str(rid)
    except Exception:
        pass
    return uuid.uuid4().hex


def _respuesta_apagado(rid: str) -> ChatOut:
    return ChatOut(
        respuesta=FALLBACK_NO_DISPONIBLE,
        tarjetas=[],
        acciones_sugeridas=[AccionOut(etiqueta="Buscar vivienda", ruta="/")],
        deshabilitado=True,
        request_id=rid,
    )


def obtener_proveedor():
    """Fake si no hay proveedor real configurado (tests + sin llave)."""
    prov = (settings.CHAT_LLM_PROVIDER or "fake").strip().lower()
    if (prov == "fake" or not settings.CHAT_LLM_API_KEY.strip()
            or not settings.CHAT_LLM_MODEL.strip()
            or not settings.CHAT_LLM_BASE_URL.strip()):
        return FakeLLMProvider()
    return HttpLLMProvider(
        base_url=settings.CHAT_LLM_BASE_URL.strip(),
        api_key=settings.CHAT_LLM_API_KEY,
        modelo=settings.CHAT_LLM_MODEL.strip(),
        timeout_s=settings.CHAT_TIMEOUT_S,
        max_tokens=settings.CHAT_MAX_TOKENS_SALIDA,
    )


@router.post("", response_model=ChatOut, summary="Chatbot (solo lectura)")
async def conversar_chat(body: ChatIn, request: Request,
                         authorization: str | None = Header(None)):
    rid = _request_id(request)
    t0 = time.monotonic()
    tools: list[str] = []
    eventos: list[str] = []
    resultado = "ok"

    # Kill switch: apagado = respuesta controlada, SIN LLM y SIN BD.
    if not settings.CHAT_ENABLED or not chat_configurado():
        logger.info("[chat] rid=%s deshabilitado (sin LLM ni BD)",
                    una_linea(rid, 40))
        return _respuesta_apagado(rid)

    # Abuso: breaker/tope diario primero (memoria, sin BD).
    try:
        tope_diario(settings.CHAT_TOPE_DIARIO)
    except HTTPException:
        logger.warning("[chat] rid=%s tope-diario/429", una_linea(rid, 40))
        raise
    ip = ip_cliente(request)
    usuario = await get_optional_user(authorization)
    uid = None
    try:
        if isinstance(usuario, dict):
            uid = usuario.get("id")
    except Exception:
        uid = None
    try:
        limite_por_clave(f"chat:ip:{ip}", settings.CHAT_LIMITE_IP_MIN, 60.0)
        if isinstance(uid, int):
            limite_por_clave(f"chat:user:{uid}",
                             settings.CHAT_LIMITE_USUARIO_MIN, 60.0)
    except HTTPException:
        logger.warning("[chat] rid=%s 429 ip/user", una_linea(rid, 40))
        raise

    # Sesión SEPARADA de solo lectura (rol chatbot_ro). Nunca la principal.
    gen = get_chat_session()
    try:
        db = await gen.__anext__()
    except HTTPException:
        logger.error("[chat] rid=%s sin-sesion-chat", una_linea(rid, 40))
        return _respuesta_apagado(rid)
    except Exception:
        resultado = "error-sesion"
        logger.error("[chat] rid=%s error-sesion", una_linea(rid, 40))
        return _respuesta_apagado(rid)
    try:
        historial = [{"rol": t.rol, "texto": t.texto} for t in body.historial]
        proveedor = obtener_proveedor()
        try:
            sal = await orchestrator.conversar(
                db, mensaje=body.mensaje, historial=historial,
                proveedor=proveedor, timeout_s=settings.CHAT_TIMEOUT_S)
        except LLMError:
            registrar_fallo_llm()
            eventos.append("llm-error")
            resultado = "fallback-llm"
            sal = {"respuesta": FALLBACK_NO_DISPONIBLE, "tarjetas": [],
                   "acciones": [{"etiqueta": "Buscar vivienda", "ruta": "/"}],
                   "tools_usadas": [], "eventos": ["llm-error"]}
        except Exception:
            resultado = "error-interno"
            sal = {"respuesta": FALLBACK_NO_DISPONIBLE, "tarjetas": [],
                   "acciones": [{"etiqueta": "Buscar vivienda", "ruta": "/"}],
                   "tools_usadas": [], "eventos": ["error-interno"]}
        tools = [str(t)[:40] for t in (sal.get("tools_usadas") or [])]
        eventos = [str(e)[:40] for e in (sal.get("eventos") or [])]
        if "llm-error" not in eventos and "error-interno" not in eventos:
            registrar_exito_llm()
        tarjetas = []
        for c in (sal.get("tarjetas") or [])[:3]:
            try:
                tarjetas.append(TarjetaOut(
                    id=int(c.get("id", 0) or 0),
                    titulo=str(c.get("titulo") or "")[:150],
                    precio=c.get("precio"),
                    tipo=(str(c.get("tipo"))[:40]
                          if c.get("tipo") else None),
                    zona=(str(c.get("zona"))[:120]
                          if c.get("zona") else None),
                    distancia_m=c.get("distancia_m"),
                    indice_confianza=c.get("indice_confianza"),
                    nivel_confianza=c.get("nivel_confianza"),
                    foto=(str(c.get("foto"))[:500]
                          if c.get("foto") else None),
                    url=f"/publicacion/{int(c.get('id', 0) or 0)}"))
            except Exception:
                continue
        acciones = []
        for a in (sal.get("acciones") or [])[:5]:
            try:
                ruta = str((a or {}).get("ruta") or "")
                if orchestrator.ruta_permitida(ruta):
                    acciones.append(AccionOut(
                        etiqueta=str((a or {}).get(
                            "etiqueta") or "")[:60],
                        ruta=ruta))
            except Exception:
                continue
        if not acciones:
            acciones = [AccionOut(etiqueta="Buscar vivienda", ruta="/")]
        return ChatOut(respuesta=str(sal.get("respuesta") or "")[:2000],
                       tarjetas=tarjetas, acciones_sugeridas=acciones,
                       deshabilitado=False, request_id=rid)
    finally:
        try:
            await gen.aclose()
        except Exception:
            pass
        ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "[chat] rid=%s resultado=%s tools=%s eventos=%s ms=%s msg_len=%s",
            una_linea(rid, 40), una_linea(resultado, 20),
            una_linea(",".join(tools), 120), una_linea(",".join(eventos), 120),
            ms, len(body.mensaje or ""))
