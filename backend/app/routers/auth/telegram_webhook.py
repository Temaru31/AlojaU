"""Webhook de Telegram: /start con token y verificación gratuita del teléfono por contacto."""
import logging
from fastapi import APIRouter
import os
import re
import secrets
import time
from datetime import datetime, timezone
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import ip_para_limites
from app.db.session import get_session
from app.core.normalizacion import digitos_nacionales
from app.services import verificacion_telefono as verificacion
from app.routers.auth.telegram_envio import _telegram_send_message_async
from app.routers.auth.telegram_vinculo import (
    _TELEGRAM_PENDIENTES,
    _TELEGRAM_USADOS,
    _TELEGRAM_VINCULOS,
    _desarmar_token_vinculo,
    validar_token_vinculo_db,
)

logger = logging.getLogger("alojau.auth")
router = APIRouter()

def webhook_secret_obligatorio() -> bool:
    """True si prod exige secret de webhook (fail-closed auditable/testeable).

    Regla: ENV=prod + bot configurado (hay USERNAME) => el secret es
    obligatorio. Así un prod mal configurado no queda abierto.
    """
    prod = (getattr(settings, "ENV", "dev") or "dev") == "prod" or os.getenv("ENV", "dev") == "prod"
    bot_cfg = bool((getattr(settings, "TELEGRAM_BOT_USERNAME", "") or "").strip())
    secret_cfg = bool((getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "") or "").strip())
    return bool(prod and bot_cfg and not secret_cfg)


def _extraer_start_payload(texto: str | None) -> str | None:
    """Extrae el payload de `/start` en sus variantes.

    Acepta: `/start`, `/startPAYLOAD`, `/start PAYLOAD`,
    `/start@BotName PAYLOAD`. Retorna el payload (o "" si /start pelado)
    o None si no es un /start.
    """
    if not texto:
        return None
    t = texto.strip()
    if not t.startswith("/start"):
        return None
    resto = t[len("/start"):]
    # Quita "@BotName" opcional.
    if resto.startswith("@"):
        partes = resto.split(None, 1)
        # "/start@Bot" sin payload -> resto es solo "@Bot"
        resto = (" " + partes[1]) if len(partes) > 1 else ""
    resto = resto.strip()
    return resto or ""


# Respuestas del bot cuando el contacto compartido no permite verificar.
_RECHAZOS_CONTACTO = {
    "contacto-ajeno": ("No pudimos confirmar que ese contacto sea tuyo. Usa el botón "
                       "«Compartir mi número de teléfono para verificar» y vuelve "
                       "a intentarlo."),
    "sin-solicitud": ("Primero abre el enlace desde AlojaU → Mi Perfil → Telegram, "
                      "pulsa /start y luego comparte tu número aquí."),
    "token-invalido": ("Ese enlace expiró (10 min, un solo uso). Genera uno nuevo en "
                       "AlojaU → Mi Perfil → Telegram."),
    "sin-telefono": ("Aún no tienes número guardado en AlojaU. Entra a Mi Perfil → "
                     "Datos y contacto, guarda tu WhatsApp y genera un enlace nuevo."),
    "duplicado": ("Este número o cuenta de Telegram ya está en uso en otra "
                  "cuenta de AlojaU."),
    "numero-distinto": ("El número de esta cuenta de Telegram (terminado en {ultimos}) "
                        "no coincide con el número guardado en tu perfil de AlojaU. "
                        "Modifícalo en la web e inténtalo de nuevo."),
    "sin-usuario": None,
}


async def _procesar_contacto(db: AsyncSession, chat_id: str, from_id, contacto: dict) -> dict:
    if not _contacto_es_del_remitente(contacto, from_id, chat_id):
        return await _rechazar_contacto(db, chat_id, "contacto-ajeno")
    pend = await _buscar_pendiente(db, str(chat_id))
    if pend is None:
        return await _rechazar_contacto(db, chat_id, "sin-solicitud")
    if time.time() > float(pend.get("exp", 0)):
        return await _rechazar_contacto(db, chat_id, "token-invalido", pend)
    uid = int(pend["user_id"])
    usuario = await _usuario_por_id(db, uid)
    if usuario is None:
        return await _rechazar_contacto(db, chat_id, "sin-usuario", pend)
    telefono = contacto.get("phone_number")
    motivo = await verificacion.motivo_rechazo(db, usuario, telefono, str(chat_id))
    if motivo is not None:
        ultimos = (digitos_nacionales(telefono) or "")[-4:] or "????"
        return await _rechazar_contacto(db, chat_id, motivo, pend, ultimos=ultimos)
    if not await _vincular_telefono(db, usuario, pend, chat_id):
        return {"ok": True, "vinculado": False, "motivo": "persistencia"}
    from app.services import telegram as servicio_telegram
    await _telegram_send_message_async(
        chat_id,
        "¡Número verificado con éxito en AlojaU! Puedes volver a la aplicación web.",
        reply_markup=servicio_telegram.teclado_quitar(),
    )
    return {"ok": True, "vinculado": True, "user_id": uid}


def _contacto_es_del_remitente(contacto: dict, from_id, chat_id) -> bool:
    """Telegram solo adjunta `contact.user_id` propio: debe coincidir con remitente y chat."""
    try:
        contact_uid = int(contacto.get("user_id"))
        return contact_uid == int(from_id) == int(str(chat_id).strip())
    except (TypeError, ValueError):
        return False


async def _rechazar_contacto(db: AsyncSession, chat_id: str, motivo: str,
                             pend: dict | None = None, **datos) -> dict:
    """Quema el pendiente (si hay) y explica el motivo al usuario."""
    if pend is not None:
        await _quemar_pendiente(db, pend)
    plantilla = _RECHAZOS_CONTACTO[motivo]
    if plantilla:
        from app.services import telegram as servicio_telegram
        await _telegram_send_message_async(chat_id, plantilla.format(**datos),
                                           reply_markup=servicio_telegram.teclado_quitar())
    return {"ok": True, "vinculado": False, "motivo": motivo}


async def _vincular_telefono(db: AsyncSession, usuario, pend: dict, chat_id: str) -> bool:
    """Verifica el teléfono, vincula el chat y quema el vínculo en una transacción."""
    try:
        verificacion.marcar_verificado(usuario, chat_id)
        try:
            from app.services import notifications_matcher
            await notifications_matcher.notificar_telegram_vinculado(db, usuario_id=int(pend["user_id"]))
        except Exception as e:
            logger.warning("[telegram webhook] aviso de vinculación no enviado: %s", exc_resumen(e))
        if pend.get("row") is not None:
            pend["row"].usado = True
        await db.commit()
    except Exception as e:
        logger.warning(f"[telegram contacto] no se pudo vincular: {exc_resumen(e)}")
        await rollback_seguro(db, "_vincular_telefono")
        return False
    _marcar_usado_en_memoria(pend.get("nonce"), str(chat_id))
    return True


def _marcar_usado_en_memoria(nonce: str | None, chat_id: str | None) -> None:
    """Refleja en la caché L1 que el vínculo ya se consumió."""
    if nonce:
        rec = _TELEGRAM_VINCULOS.get(nonce)
        if rec:
            rec["usado"] = True
        _TELEGRAM_USADOS.add(nonce)
    _TELEGRAM_PENDIENTES.pop(chat_id, None)


def _autorizar_webhook(request: Request) -> None:
    """503 si falta el secret obligatorio, 401 si no coincide, 429 por throttle."""
    if webhook_secret_obligatorio():
        raise HTTPException(
            status_code=503,
            detail="Telegram mal configurado en el servidor (falta TELEGRAM_WEBHOOK_SECRET)",
        )
    secreto_cfg = (getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "") or "").strip()
    if secreto_cfg:
        enviado = (request.headers.get("X-Telegram-Bot-Api-Secret-Token") or "").strip()
        if not secrets.compare_digest(enviado, secreto_cfg):
            raise HTTPException(status_code=401, detail="Secret de webhook inválido")
    from app.services import telegram as servicio_telegram
    servicio_telegram.check_throttle(f"tg_wh:{ip_para_limites(request)}", 60, 60.0,
                                     "Demasiadas peticiones al webhook, espera 1 minuto")


def _parece_numero_escrito(texto: str) -> bool:
    """Texto que parece un teléfono (7-15 dígitos) y no es un comando."""
    digitos = re.sub(r"\D", "", texto or "")
    return bool(texto) and not str(texto).strip().startswith("/") and 7 <= len(digitos) <= 15


async def _rechazar_numero_escrito(chat_id: str) -> dict:
    """Un número escrito a mano no prueba nada: se guía al botón nativo."""
    from app.services import telegram as servicio_telegram
    await _telegram_send_message_async(
        chat_id,
        "Por seguridad no acepto números escritos a mano: cualquiera "
        "podría escribir el de otra persona. Usa el botón «Compartir "
        "mi número de teléfono para verificar» para probar que la "
        "cuenta es tuya.",
        reply_markup=servicio_telegram.teclado_quitar(),
    )
    return {"ok": True, "vinculado": False, "motivo": "texto-ignorado"}


async def _atender_start(db: AsyncSession, chat_id: str, payload: str) -> dict:
    """Paso 1: valida el token, exige teléfono guardado y deja el chat pendiente.

    El /start NO vincula: el vínculo se completa con el contacto compartido.
    Sin teléfono guardado el token se conserva (10 min) para dar tiempo a
    guardarlo en la web.
    """
    from app.services import telegram as servicio_telegram
    try:
        uid = await validar_token_vinculo_db(db, payload, commit=False)
    except Exception as e:
        logger.warning(f"[telegram webhook] validación falló: {exc_resumen(e)}")
        uid = None
    if uid is None:
        await rollback_seguro(db, "_atender_start")
        await _telegram_send_message_async(
            chat_id,
            "Este enlace de vinculación ha expirado o es inválido. Genera "
            "uno nuevo desde tu perfil en AlojaU.",
        )
        return {"ok": True, "vinculado": False, "motivo": "token-invalido"}
    usuario = await _usuario_por_id(db, uid)
    if usuario is None:
        await rollback_seguro(db, "_atender_start")
        return {"ok": True, "vinculado": False, "motivo": "sin-usuario"}
    if not getattr(usuario, "telefono_whatsapp", None):
        await rollback_seguro(db, "_atender_start")
        await _telegram_send_message_async(
            chat_id,
            "Aún no tienes número guardado en AlojaU. Entra a Mi Perfil → "
            "Datos y contacto, guarda tu WhatsApp y luego comparte tu "
            "contacto aquí con el botón.",
            reply_markup=servicio_telegram.teclado_pedir_contacto(),
        )
        return {"ok": True, "vinculado": False, "motivo": "sin-telefono"}
    if not await _registrar_chat_pendiente(db, chat_id, payload):
        await _telegram_send_message_async(
            chat_id,
            "Hubo un problema guardando la solicitud. Genera un enlace nuevo "
            "en AlojaU → Mi Perfil → Telegram e inténtalo de nuevo.",
        )
        return {"ok": True, "vinculado": False, "motivo": "persistencia"}
    await _telegram_send_message_async(
        chat_id,
        servicio_telegram.TEXTO_PEDIR_CONTACTO,
        reply_markup=servicio_telegram.teclado_pedir_contacto(),
    )
    return {"ok": True, "vinculado": False, "contacto_requerido": True, "user_id": uid}


async def _registrar_chat_pendiente(db: AsyncSession, chat_id: str, payload: str) -> bool:
    """Asocia el chat al vínculo del token (PG + caché L1) y confirma la transacción."""
    from app.models import TelegramVinculo
    try:
        parsed = _desarmar_token_vinculo(payload)
        nonce = parsed[2] if parsed else None
        if nonce:
            _TELEGRAM_PENDIENTES[str(chat_id)] = nonce
            res = await db.execute(select(TelegramVinculo).where(TelegramVinculo.nonce == nonce))
            row = res.scalars().first()
            if row is not None:
                row.chat_id_pendiente = str(chat_id)
        await db.commit()
        return True
    except Exception as e:
        await rollback_seguro(db, "_registrar_chat_pendiente")
        logger.warning(f"[telegram webhook] no se pudo registrar pendiente: {exc_resumen(e)}")
        return False


async def _usuario_por_id(db: AsyncSession, uid: int):
    """Fila ORM del usuario, o None si no existe o la BD no responde."""
    from app.models import Usuario
    try:
        res = await db.execute(select(Usuario).where(Usuario.id == uid))
        return res.scalars().first()
    except Exception as e:
        logger.warning("[telegram] lectura del usuario falló: %s", exc_resumen(e))
        return None


async def _buscar_pendiente(db: AsyncSession, chat_id: str):
    """Vínculo pendiente de ese chat (no usado, no expirado). PG + memoria.

    Retorna dict {user_id, nonce, exp, row|None} o None si no hay solicitud.
    """
    ahora = datetime.now(timezone.utc)
    try:
        from app.models import TelegramVinculo
        res = await db.execute(
            select(TelegramVinculo).where(
                TelegramVinculo.chat_id_pendiente == chat_id,
                TelegramVinculo.usado.is_(False),
                TelegramVinculo.expira_en > ahora,
            ).order_by(TelegramVinculo.expira_en.desc())
        )
        row = res.scalars().first()
        if row is not None:
            exp = row.expira_en
            if getattr(exp, "tzinfo", None) is None:
                exp = exp.replace(tzinfo=timezone.utc)
            return {"user_id": int(row.usuario_id), "nonce": row.nonce,
                    "exp": exp.timestamp(), "row": row, "chat_id": str(chat_id)}
    except Exception as e:
        logger.warning("[telegram] lectura de la vinculación pendiente falló: %s", exc_resumen(e))
    nonce = _TELEGRAM_PENDIENTES.get(str(chat_id))
    rec = _TELEGRAM_VINCULOS.get(nonce) if nonce else None
    if rec and not rec.get("usado") and rec.get("exp", 0) > time.time():
        return {"user_id": rec["user_id"], "nonce": nonce,
                "exp": rec["exp"], "row": None, "chat_id": str(chat_id)}
    return None


async def _webhook_contacto(db: AsyncSession, chat_id: str, from_id, contacto: dict):
    """Paso 2: el contacto compartido VERIFICA el teléfono (gratis) y vincula.

    La prueba de titularidad la da Telegram: el servidor solo adjunta
    `contact.user_id` cuando el contacto es la cuenta del remitente (un
    reenvío ajeno trae otro user_id y el texto plano no trae ninguno).
    Checks en orden (cada rechazo quema el pendiente: un solo uso):
    1. El contacto es del que escribe (`user_id == from.id == chat`).
    2. Hay solicitud pendiente vigente de ese chat (/start previo).
    3. El usuario tiene teléfono GUARDADO en su perfil (no exige
       verificación previa: este flujo ES la verificación gratuita).
    4. Ni el número ni este chat están en uso por OTRA cuenta activa.
    5. Los últimos 10 dígitos coinciden con el guardado.
    En éxito: `telefono_verificado=True` + `telegram_chat_id`. Nunca lanza.
    """
    try:
        return await _procesar_contacto(db, chat_id, from_id, contacto)
    except Exception as e:
        logger.warning(f"[telegram contacto] fallo inesperado: {exc_resumen(e)}")
        await rollback_seguro(db, "_webhook_contacto")
        return {"ok": True, "vinculado": False, "motivo": "error"}


async def _quemar_pendiente(db: AsyncSession, pend: dict) -> None:
    """Consume el vínculo (un solo uso) en PG + memoria. Nunca lanza."""
    row = pend.get("row")
    if row is not None:
        try:
            row.usado = True
            await db.commit()
        except Exception as e:
            await rollback_seguro(db, "_quemar_pendiente")
            logger.warning("[telegram] no se pudo marcar el vínculo como usado: %s", exc_resumen(e))
    _marcar_usado_en_memoria(pend.get("nonce"), pend.get("chat_id"))


@router.post("/telegram/webhook", summary="Verificación gratis: /start + contacto nativo")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_session)):
    """Webhook productivo de Telegram — verificación telefónica gratuita.

    Paso 1 `/start <TOKEN>` (chat privado): valida el token (HMAC, 10 min,
    un solo uso, PG) y, si el usuario tiene teléfono GUARDADO, registra el
    chat como pendiente y pide el contacto (teclado request_contact nativo).
    NO vincula todavía. Sin teléfono guardado se conserva el token y se
    guía a guardarlo (el contacto posterior es lo que verifica).
    Paso 2 contacto compartido: ver `_webhook_contacto`.

    Seguridad: exige `X-Telegram-Bot-Api-Secret-Token` si hay secret
    configurado; en prod con bot configurado el secret es OBLIGATORIO
    (fail-closed 503 si falta). Throttle 60/min por IP (anti-enumeración).
    Ignora grupos/canales. Transacción ÚNICA por paso. `telegram_chat_id`
    se guarda como texto (VARCHAR(32)) para IDs de 64 bits.
    """
    _autorizar_webhook(request)
    try:
        cuerpo = await request.json()
    except Exception:
        return {"ok": True, "ignorado": "sin-json"}
    msg = (cuerpo or {}).get("message") or (cuerpo or {}).get("edited_message") or {}
    chat = msg.get("chat") or {}
    if str(chat.get("type") or "private") != "private":
        return {"ok": True, "ignorado": "no-privado"}  # nunca grupos/canales
    try:
        chat_id = str(int(str(chat.get("id")).strip()))  # BIGINT -> texto sin espacios
    except (TypeError, ValueError):
        return {"ok": True, "ignorado": "chat-id-invalido"}
    contacto = msg.get("contact")
    if isinstance(contacto, dict) and contacto:
        return await _webhook_contacto(db, chat_id, (msg.get("from") or {}).get("id"), contacto)
    texto = msg.get("text") or ""
    if _parece_numero_escrito(texto):
        return await _rechazar_numero_escrito(chat_id)
    payload = _extraer_start_payload(texto)
    if payload is None:
        return {"ok": True, "ignorado": "no-start"}
    if not payload:
        await _telegram_send_message_async(
            chat_id,
            "Hola, soy AlojaU. Para vincular tu cuenta, entra a AlojaU → Mi Perfil → "
            "Telegram → «Abrir Bot en Telegram» y pulsa el botón /start que te abre.",
        )
        return {"ok": True, "ignorado": "start-sin-payload"}
    return await _atender_start(db, chat_id, payload.strip())
