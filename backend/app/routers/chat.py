"""POST /api/chat — asistente de ayuda de AlojaU (explica las funcionalidades).

- NO usa la base de datos: responde desde la base de conocimiento estática
  (`services/chat/kb`) y, si hay proveedor LLM configurado, la redacta con él.
- Auth OPCIONAL (`get_optional_user`): con JWT válido se usa la identidad solo
  para el rate-limit. Sin token = anónimo.
- Kill switch: `CHAT_ENABLED=false` (default) responde controlado SIN LLM.
- Defensas: throttle por IP y por usuario, tope diario global + circuit
  breaker, topes de mensaje/historial, timeout al LLM, fallback en español.
- Logs: request_id, longitudes, documentos usados, latencia y resultado.
  NUNCA el texto del mensaje ni PII (logseguro).
"""
import time
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.core.config import settings
from app.core.logseguro import una_linea
from app.core.security import get_optional_user
from app.services.chat import orchestrator
from app.services.chat.llm import FakeLLMProvider, HttpLLMProvider, LLMError, LLMProvider
from app.core.net import ip_para_limites
from app.services.chat.prompts import FALLBACK_NO_DISPONIBLE
from app.services.chat.schemas import AccionOut, ChatIn, ChatOut
from app.services.chat.throttle import (
    limite_por_clave,
    limite_por_hora,
    turno_en_curso,
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
        acciones_sugeridas=[AccionOut(etiqueta="Ir a la búsqueda", ruta="/")],
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


_ACCION_POR_DEFECTO = {"etiqueta": "Ir a la búsqueda", "ruta": "/"}
_MAX_SUGERENCIAS = 3


def _salida_fallback(evento: str) -> dict:
    """Salida del orquestador cuando el LLM o el flujo fallan: mensaje fijo en español."""
    return {"respuesta": FALLBACK_NO_DISPONIBLE,
            "acciones": [dict(_ACCION_POR_DEFECTO)],
            "docs_usados": [], "eventos": [evento]}


def _sugerencias_out(sal: dict) -> list[str]:
    """Hasta 3 preguntas sugeridas (texto plano corto, generado en el servidor)."""
    salida = []
    for texto in (sal.get("sugerencias") or [])[:_MAX_SUGERENCIAS]:
        if isinstance(texto, str) and texto.strip():
            salida.append(texto.strip()[:80])
    return salida


def _acciones_out(sal: dict) -> list[AccionOut]:
    """Hasta 5 acciones con ruta permitida (puede quedar vacía: no se fuerza un botón genérico)."""
    acciones = []
    for a in (sal.get("acciones") or [])[:5]:
        try:
            ruta = str((a or {}).get("ruta") or "")
            if orchestrator.ruta_permitida(ruta):
                acciones.append(AccionOut(
                    etiqueta=str((a or {}).get("etiqueta") or "")[:60], ruta=ruta))
        except (ValueError, TypeError, AttributeError):
            continue
    return acciones


async def _aplicar_limites(request: Request, authorization: str | None, rid: str) -> str:
    """Límites por IP y usuario y, al final, el tope diario global. Devuelve la IP.

    La IP sale de `ip_para_limites` (no de X-Forwarded-For crudo): si no, un
    cliente cambiaría la cabecera en cada petición y nunca chocaría el límite.
    El tope diario va DESPUÉS de los límites por IP para que las peticiones
    rechazadas de una sola IP no agoten el cupo diario de todos.
    """
    ip = ip_para_limites(request)
    usuario = await get_optional_user(authorization)
    uid = usuario.get("id") if isinstance(usuario, dict) else None
    try:
        limite_por_clave(f"chat:rafaga:{ip}", settings.CHAT_LIMITE_IP_RAFAGA, 10.0)
        limite_por_clave(f"chat:ip:{ip}", settings.CHAT_LIMITE_IP_MIN, 60.0)
        limite_por_hora(f"chat:hora:{ip}", settings.CHAT_LIMITE_IP_HORA)
        if isinstance(uid, int):
            limite_por_clave(f"chat:user:{uid}",
                             settings.CHAT_LIMITE_USUARIO_MIN, 60.0)
    except HTTPException:
        logger.warning("[chat] rid=%s 429 ip/user", una_linea(rid, 40))
        raise
    try:
        tope_diario(settings.CHAT_TOPE_DIARIO)
    except HTTPException:
        logger.warning("[chat] rid=%s tope-diario/429", una_linea(rid, 40))
        raise
    return ip


async def _turno(body: ChatIn, proveedor: LLMProvider) -> tuple[dict, str]:
    """Llama al orquestador; ante fallo del LLM o interno, salida de respaldo. Devuelve (salida, resultado)."""
    historial = [{"rol": t.rol, "texto": t.texto} for t in body.historial]
    try:
        sal = await orchestrator.conversar(
            mensaje=body.mensaje, historial=historial,
            proveedor=proveedor, timeout_s=settings.CHAT_TIMEOUT_S)
    except LLMError:
        registrar_fallo_llm()
        return _salida_fallback("llm-error"), "fallback-llm"
    except Exception:
        return _salida_fallback("error-interno"), "error-interno"
    return sal, "ok"


def _medir(rid: str, t0: float, resultado: str,
           docs: list[str], eventos: list[str], msg_len: int) -> None:
    """Log de métricas (nunca el texto del mensaje)."""
    ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        "[chat] rid=%s resultado=%s docs=%s eventos=%s ms=%s msg_len=%s",
        una_linea(rid, 40), una_linea(resultado, 20),
        una_linea(",".join(docs), 120), una_linea(",".join(eventos), 120),
        ms, msg_len)


@router.post("", response_model=ChatOut, summary="Asistente de ayuda de AlojaU")
async def conversar_chat(body: ChatIn, request: Request,
                         authorization: str | None = Header(None),
                         proveedor: LLMProvider = Depends(obtener_proveedor)):
    rid = _request_id(request)
    t0 = time.monotonic()
    docs: list[str] = []
    eventos: list[str] = []
    resultado = "ok"

    # Kill switch: apagado = respuesta controlada, SIN LLM.
    if not settings.CHAT_ENABLED:
        logger.info("[chat] rid=%s deshabilitado", una_linea(rid, 40))
        return _respuesta_apagado(rid)

    ip = await _aplicar_limites(request, authorization, rid)
    try:
        with turno_en_curso(f"chat:curso:{ip}", settings.CHAT_MAX_EN_CURSO_IP):
            sal, resultado = await _turno(body, proveedor)
        docs = [str(d)[:40] for d in (sal.get("docs_usados") or [])]
        eventos = [str(e)[:40] for e in (sal.get("eventos") or [])]
        if "llm-error" not in eventos and "error-interno" not in eventos:
            registrar_exito_llm()
        return ChatOut(respuesta=str(sal.get("respuesta") or "")[:2000],
                       acciones_sugeridas=_acciones_out(sal),
                       sugerencias=_sugerencias_out(sal),
                       deshabilitado=False, request_id=rid)
    finally:
        _medir(rid, t0, resultado, docs, eventos, len(body.mensaje or ""))
