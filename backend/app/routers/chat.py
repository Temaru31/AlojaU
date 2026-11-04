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

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.core.config import settings
from app.core.logseguro import exc_resumen, una_linea
from app.core.security import get_optional_user
from app.db.chat_session import chat_configurado, get_chat_session
from app.services.chat import orchestrator
from app.services.chat.llm import FakeLLMProvider, HttpLLMProvider, LLMError, LLMProvider
from app.core.net import client_ip
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
    rid = getattr(getattr(request, "state", None), "request_id", None)
    return str(rid) if rid else uuid.uuid4().hex


def _respuesta_apagado(rid: str) -> ChatOut:
    return ChatOut(
        respuesta=FALLBACK_NO_DISPONIBLE,
        tarjetas=[],
        acciones_sugeridas=[AccionOut(etiqueta="Buscar vivienda", ruta="/")],
        deshabilitado=True,
        request_id=rid,
    )


def obtener_proveedor() -> LLMProvider:
    """Dependencia del endpoint: Fake si no hay proveedor real configurado
    (tests + sin llave). En pruebas: `app.dependency_overrides[obtener_proveedor]`."""
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


_ACCION_POR_DEFECTO = {"etiqueta": "Buscar vivienda", "ruta": "/"}


def _salida_fallback(evento: str) -> dict:
    """Salida del orquestador cuando el LLM o el flujo fallan: mensaje fijo en español."""
    return {"respuesta": FALLBACK_NO_DISPONIBLE, "tarjetas": [],
            "acciones": [dict(_ACCION_POR_DEFECTO)],
            "tools_usadas": [], "eventos": [evento]}


def _texto_o_none(valor, tope: int) -> str | None:
    return str(valor)[:tope] if valor else None


def _tarjeta_out(c: dict) -> TarjetaOut:
    pub_id = int(c.get("id", 0) or 0)
    return TarjetaOut(
        id=pub_id,
        titulo=str(c.get("titulo") or "")[:150],
        precio=c.get("precio"),
        tipo=_texto_o_none(c.get("tipo"), 40),
        zona=_texto_o_none(c.get("zona"), 120),
        distancia_m=c.get("distancia_m"),
        indice_confianza=c.get("indice_confianza"),
        nivel_confianza=c.get("nivel_confianza"),
        foto=_texto_o_none(c.get("foto"), 500),
        url=f"/publicacion/{pub_id}")


def _tarjetas_out(sal: dict) -> list[TarjetaOut]:
    """Hasta 3 tarjetas; una tarjeta malformada se descarta sin tumbar la respuesta."""
    tarjetas = []
    for c in (sal.get("tarjetas") or [])[:3]:
        try:
            tarjetas.append(_tarjeta_out(c))
        except (ValueError, TypeError, AttributeError):
            continue
    return tarjetas


def _acciones_out(sal: dict) -> list[AccionOut]:
    """Hasta 5 acciones con ruta permitida; si no queda ninguna, la acción por defecto."""
    acciones = []
    for a in (sal.get("acciones") or [])[:5]:
        try:
            ruta = str((a or {}).get("ruta") or "")
            if orchestrator.ruta_permitida(ruta):
                acciones.append(AccionOut(
                    etiqueta=str((a or {}).get("etiqueta") or "")[:60], ruta=ruta))
        except (ValueError, TypeError, AttributeError):
            continue
    return acciones or [AccionOut(**_ACCION_POR_DEFECTO)]


async def _aplicar_limites(request: Request, authorization: str | None, rid: str) -> None:
    """Tope diario/breaker (memoria, sin BD) y throttle por IP y por usuario: 429 si se exceden."""
    try:
        tope_diario(settings.CHAT_TOPE_DIARIO)
    except HTTPException:
        logger.warning("[chat] rid=%s tope-diario/429", una_linea(rid, 40))
        raise
    ip = client_ip(request)
    usuario = await get_optional_user(authorization)
    uid = usuario.get("id") if isinstance(usuario, dict) else None
    try:
        limite_por_clave(f"chat:ip:{ip}", settings.CHAT_LIMITE_IP_MIN, 60.0)
        if isinstance(uid, int):
            limite_por_clave(f"chat:user:{uid}",
                             settings.CHAT_LIMITE_USUARIO_MIN, 60.0)
    except HTTPException:
        logger.warning("[chat] rid=%s 429 ip/user", una_linea(rid, 40))
        raise


async def _abrir_sesion_chat(gen, rid: str):
    """Primera sesión del generador de solo lectura, o None si no hay (se responde apagado)."""
    try:
        return await gen.__anext__()
    except HTTPException:
        logger.error("[chat] rid=%s sin-sesion-chat", una_linea(rid, 40))
    except Exception:
        logger.error("[chat] rid=%s error-sesion", una_linea(rid, 40))
    return None


async def _turno(db, body: ChatIn, proveedor: LLMProvider) -> tuple[dict, str]:
    """Llama al orquestador; ante fallo del LLM o interno, salida de respaldo. Devuelve (salida, resultado)."""
    historial = [{"rol": t.rol, "texto": t.texto} for t in body.historial]
    try:
        sal = await orchestrator.conversar(
            db, mensaje=body.mensaje, historial=historial,
            proveedor=proveedor, timeout_s=settings.CHAT_TIMEOUT_S)
    except LLMError:
        registrar_fallo_llm()
        return _salida_fallback("llm-error"), "fallback-llm"
    except Exception:
        return _salida_fallback("error-interno"), "error-interno"
    return sal, "ok"


async def _cerrar_y_medir(gen, rid: str, t0: float, resultado: str,
                          tools: list[str], eventos: list[str], msg_len: int) -> None:
    """Cierra la sesión del chat y deja el log de métricas (nunca el texto del mensaje)."""
    try:
        await gen.aclose()
    except Exception as e:
        logger.warning("[chat] cierre del generador falló: %s", exc_resumen(e))
    ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        "[chat] rid=%s resultado=%s tools=%s eventos=%s ms=%s msg_len=%s",
        una_linea(rid, 40), una_linea(resultado, 20),
        una_linea(",".join(tools), 120), una_linea(",".join(eventos), 120),
        ms, msg_len)


@router.post("", response_model=ChatOut, summary="Chatbot (solo lectura)")
async def conversar_chat(body: ChatIn, request: Request,
                         authorization: str | None = Header(None),
                         proveedor: LLMProvider = Depends(obtener_proveedor)):
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

    await _aplicar_limites(request, authorization, rid)

    # Sesión SEPARADA de solo lectura (rol chatbot_ro). Nunca la principal.
    gen = get_chat_session()
    db = await _abrir_sesion_chat(gen, rid)
    if db is None:
        return _respuesta_apagado(rid)
    try:
        sal, resultado = await _turno(db, body, proveedor)
        tools = [str(t)[:40] for t in (sal.get("tools_usadas") or [])]
        eventos = [str(e)[:40] for e in (sal.get("eventos") or [])]
        if "llm-error" not in eventos and "error-interno" not in eventos:
            registrar_exito_llm()
        return ChatOut(respuesta=str(sal.get("respuesta") or "")[:2000],
                       tarjetas=_tarjetas_out(sal),
                       acciones_sugeridas=_acciones_out(sal),
                       deshabilitado=False, request_id=rid)
    finally:
        await _cerrar_y_medir(gen, rid, t0, resultado, tools, eventos, len(body.mensaje or ""))
