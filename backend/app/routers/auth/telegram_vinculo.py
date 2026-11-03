"""Vinculación de Telegram y verificación telefónica gratuita por webhook."""
import logging
from fastapi import APIRouter
import os
import re
import secrets
import time
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import ip_para_limites
from app.core.rate_limit import registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.routers.auth.comun import digitos_nacionales
from app.routers.auth.telegram_envio import _telegram_send_message_async

logger = logging.getLogger("alojau.auth")
router = APIRouter()

_TG_MEM: dict[str, list[float]] = {}
TG_LIMIT = 5
TG_WINDOW_S = 900.0


# ---------------------------------------------------------------------------
# Vinculación Telegram $0 (HMAC un solo uso, 10min).
# ---------------------------------------------------------------------------
_TELEGRAM_VINCULOS: dict[str, dict] = {}  # nonce -> {user_id, exp, usado}
_TELEGRAM_USADOS: set[str] = set()


def _firmar_vinculo(user_id: int, exp: int, nonce: str) -> str:
    """Firma un token de vinculación URL-safe para deep-linking de Telegram.

    Bloque 1 fix: el formato legacy `uid.exp.nonce.sig` usa puntos, pero
    Telegram solo acepta `start` con `[A-Za-z0-9_-]{1,64}` (los puntos se
    truncan y el payload nunca llega al webhook). El formato nuevo usa
    `_` como separador: `uid_exp_nonce_sig` (sig recortada a 16 hex = 64
    bits, suficiente para 10 min + un solo uso) y nonce corto para que el
    token total quede <= 64 chars.
    """
    import hashlib as _hl
    import hmac as _hm
    payload = f"{user_id}_{exp}_{nonce}"
    sig = _hm.new(settings.SECRET_KEY.encode(), payload.encode(), _hl.sha256).hexdigest()[:16]
    return f"{payload}_{sig}"


def _desarmar_token_vinculo(token: str) -> tuple[int, int, str] | None:
    """Parse + HMAC + expiración de un token (sin tocar stores).

    Fuente única para las dos variantes de validación. Acepta formato
    nuevo `a_b_c_d` (URL-safe, sig 16/32 hex) y legacy `a.b.c.d` (sig 32)
    para compatibilidad con tokens emitidos antes del fix. Retorna
    (uid, exp, nonce) o None si el formato/firma/expiración fallan.
    """
    import hashlib as _hl
    import hmac as _hm
    try:
        raw = (token or "").strip()
        # Normaliza: ambos separadores a "_" y parte en 4.
        if raw.count(".") == 3 and "_" not in raw:
            partes = raw.split(".")
        else:
            partes = raw.split("_")
        if len(partes) != 4:
            return None
        uid_s, exp_s, nonce, sig = partes
        if not uid_s.lstrip("-").isdigit() or not exp_s.isdigit():
            return None
        if not nonce or not sig:
            return None
        uid = int(uid_s)
        exp = int(exp_s)
        if time.time() > exp:
            return None
        for sep in ("_", "."):
            esperado_full = _hm.new(
                settings.SECRET_KEY.encode(), f"{uid}{sep}{exp}{sep}{nonce}".encode(), _hl.sha256
            ).hexdigest()
            # Acepta sig completa (32) o recortada (16) en ambos separadores.
            if secrets.compare_digest(esperado_full[:32], sig) or secrets.compare_digest(
                esperado_full[:16], sig
            ):
                return uid, exp, nonce
        return None
    except Exception:
        return None


def validar_token_vinculo(token: str) -> int | None:
    """Valida y consume (un solo uso) un token de vinculación (vía memoria).

    Retorna user_id si es válido y no expirado/usado; lo marca usado.
    Camino rápido en-proceso (dev/tests de HMAC); el webhook productivo
    debe usar `validar_token_vinculo_db` (fuente PG, sobrevive redeploys).
    """
    try:
        parsed = _desarmar_token_vinculo(token)
        if not parsed:
            return None
        uid, exp, nonce = parsed
        if nonce in _TELEGRAM_USADOS:
            return None
        rec = _TELEGRAM_VINCULOS.get(nonce)
        if not rec or rec.get("user_id") != uid or rec.get("exp") != exp:
            return None
        if rec.get("usado"):
            return None
        rec["usado"] = True
        _TELEGRAM_USADOS.add(nonce)
        return uid
    except Exception:
        return None


async def validar_token_vinculo_db(db: AsyncSession, token: str,
                                   commit: bool = True) -> int | None:
    """Variante persistente para el webhook del bot (Bloque 2).

    Misma semántica que `validar_token_vinculo` pero contra PG con
    `SELECT FOR UPDATE` (cierra la carrera de doble-consumo entre workers).
    Con `commit=True` consume (un solo uso). Con `commit=False` SOLO
    verifica (sin marcar usado, sin tocar memoria): el caller decide el
    destino — registrar pendiente (Opción A) o quemar explícitamente.
    Si PG no responde, cae al camino en memoria (resiliencia dev, misma
    regla commit True/False).
    """
    parsed = _desarmar_token_vinculo(token)
    if not parsed:
        return None
    uid, exp, nonce = parsed
    try:
        from app.models import TelegramVinculo
        res = await db.execute(
            select(TelegramVinculo).where(TelegramVinculo.nonce == nonce).with_for_update()
        )
        row = res.scalars().first()
        if not row or int(row.usuario_id) != uid:
            return None
        exp_db = row.expira_en
        if getattr(exp_db, "tzinfo", None) is None:
            exp_db = exp_db.replace(tzinfo=timezone.utc)
        if exp_db <= datetime.now(timezone.utc) or row.usado:
            return None
        if commit:
            row.usado = True
            await db.commit()
            _TELEGRAM_USADOS.add(nonce)
            _TELEGRAM_VINCULOS.pop(nonce, None)
        else:
            await db.flush()
        return uid
    except Exception as e:
        await rollback_seguro(db, "validar_token_vinculo_db")
        logger.warning(f"[telegram validar] PG no disponible, fallback memoria: {exc_resumen(e)}")
        return None


async def _acuñar_vinculo(db: AsyncSession, uid: int) -> tuple[str, int]:
    """Crea un token de vinculación (memoria + PG) y anula los previos.

    Retorna (token, exp). Fuente única para POST vincular-inicio y GET
    enlace: un solo enlace vivo por usuario.
    """
    exp = int(time.time()) + 600
    # Nonce corto (8 hex) para que el token total quede <= 64 chars
    # (límite de Telegram para `?start=`). Formato URL-safe con "_".
    nonce = secrets.token_hex(4)
    token = _firmar_vinculo(uid, exp, nonce)
    _TELEGRAM_VINCULOS[nonce] = {"user_id": uid, "exp": exp, "usado": False}
    # Anula enlaces previos del mismo usuario (memoria + PG): un solo vivo.
    for _k, _v in list(_TELEGRAM_VINCULOS.items()):
        if _k != nonce and _v.get("user_id") == uid and not _v.get("usado"):
            _v["usado"] = True
            _TELEGRAM_USADOS.add(_k)
    # Espejo persistente (fuente de verdad ante redeploys).
    try:
        from app.models import TelegramVinculo
        db.add(TelegramVinculo(
            nonce=nonce, usuario_id=uid,
            expira_en=datetime.fromtimestamp(exp, tz=timezone.utc),
            usado=False,
        ))
        await db.execute(
            TelegramVinculo.__table__.update().where(
                TelegramVinculo.usuario_id == uid,
                TelegramVinculo.nonce != nonce,
                TelegramVinculo.usado.is_(False),
            ).values(usado=True)
        )
        await db.commit()
    except Exception as e:
        await rollback_seguro(db, "_acuñar_vinculo")
        logger.warning(f"[telegram inicio] PG no disponible, solo memoria: {exc_resumen(e)}")
    return token, exp


async def _enlace_vigente(db: AsyncSession, uid: int, username: str) -> tuple[str, int] | None:
    """Reutiliza el vínculo vigente del usuario sin acuñar uno nuevo.

    Retorna (bot_url, segundos_restantes) o None si no hay ninguno válido.
    El token se reconstruye del registro (nonce + exp firmados): no se
    invalida nada ni se ensucia la tabla en cada lectura del perfil.
    """
    ahora = datetime.now(timezone.utc)
    try:
        from app.models import TelegramVinculo
        res = await db.execute(
            select(TelegramVinculo).where(
                TelegramVinculo.usuario_id == uid,
                TelegramVinculo.usado.is_(False),
                TelegramVinculo.expira_en > ahora,
            ).order_by(TelegramVinculo.expira_en.desc())
        )
        row = res.scalars().first()
        if row is not None:
            exp_dt = row.expira_en
            if getattr(exp_dt, "tzinfo", None) is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            exp = int(exp_dt.timestamp())
            segundos = max(1, int((exp_dt - ahora).total_seconds()))
            return (f"https://t.me/{username}?start={_firmar_vinculo(uid, exp, row.nonce)}",
                    segundos)
    except Exception as e:
        await rollback_seguro(db, "_enlace_vigente")
        logger.warning("[telegram] lectura del enlace vigente falló: %s", exc_resumen(e))
    return None


@router.post("/telegram/vincular-inicio", summary="M5: iniciar vinculación Telegram (bot_url HMAC 10min)")
async def telegram_vincular_inicio(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Requiere sesión autenticada. Retorna bot_url t.me con token HMAC
    de un solo uso (10min). El frontend abre ese bot_url directamente.

    Al generar uno nuevo se anulan los previos del mismo usuario (un solo
    enlace vivo a la vez: si el anterior se filtró, deja de valer).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    # Throttle 5/15min por usuario (memoria en dev + PG en prod).
    registrar_intento(_TG_MEM, f"tg:{uid}", TG_LIMIT, TG_WINDOW_S,
                   "Demasiadas vinculaciones de Telegram, espera 15 minutos")
    await verificar_intentos_fallidos(db, f"tg:{uid}", limite=TG_LIMIT, ventana_s=int(TG_WINDOW_S))
    username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
    if not username:
        raise HTTPException(status_code=503, detail="Telegram no configurado (TELEGRAM_BOT_USERNAME). Vincula por correo.")
    token, exp = await _acuñar_vinculo(db, uid)
    await registrar_intento_persistente(db, f"tg:{uid}", False)
    # Limpieza best-effort de expirados (memoria acotada + PG).
    ahora = time.time()
    for k in [k for k, v in _TELEGRAM_VINCULOS.items() if v.get("exp", 0) < ahora - 60]:
        _TELEGRAM_VINCULOS.pop(k, None)
    try:
        from app.models import TelegramVinculo
        await db.execute(
            TelegramVinculo.__table__.delete().where(
                TelegramVinculo.expira_en < datetime.now(timezone.utc) - timedelta(seconds=60))
        )
        await db.commit()
    except Exception:
        await rollback_seguro(db, "telegram_vincular_inicio")
    return {"bot_url": f"https://t.me/{username}?start={token}", "expira_segundos": 600}


@router.get("/telegram/enlace", summary="M5: enlace pre-generado del bot (deep link para <a>)")
async def telegram_enlace(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Entrega el deep link `t.me/...?start=TOKEN` ya firmado.

    Diseñado para el anchor nativo del frontend (`<a target=_blank>`): como
    el enlace existe ANTES del clic, ningún bloqueador lo intercepta ni hay
    pestañas `about:blank`. Reutiliza el vínculo vigente (no acuña ni
    invalida en cada lectura); solo acuña uno nuevo si no hay ninguno
    válido (con el mismo throttle de vincular-inicio). Exige teléfono
    guardado (422 si no hay nada que verificar) y bot configurado (503).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
    if not username:
        raise HTTPException(status_code=503, detail="Telegram no configurado (TELEGRAM_BOT_USERNAME). Vincula por correo.")
    # Prerrequisito: número guardado (el frontend también bloquea la tarjeta).
    tiene_fono = False
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if u is not None:
            tiene_fono = bool((u.telefono_whatsapp or "").strip())
    except Exception:
        await rollback_seguro(db, "telegram_enlace")
    if not tiene_fono:
        raise HTTPException(
            status_code=422,
            detail="Guarda tu número de WhatsApp en tu perfil antes de generar el enlace.",
        )
    vigente = await _enlace_vigente(db, uid, username)
    if vigente is not None:
        bot_url, segundos = vigente
        return {"bot_url": bot_url, "expira_segundos": segundos}
    # Sin vínculo vigente: acuñar (con throttle, igual que vincular-inicio).
    registrar_intento(_TG_MEM, f"tg:{uid}", TG_LIMIT, TG_WINDOW_S,
                   "Demasiadas vinculaciones de Telegram, espera 15 minutos")
    await verificar_intentos_fallidos(db, f"tg:{uid}", limite=TG_LIMIT, ventana_s=int(TG_WINDOW_S))
    token, _exp = await _acuñar_vinculo(db, uid)
    await registrar_intento_persistente(db, f"tg:{uid}", False)
    return {"bot_url": f"https://t.me/{username}?start={token}", "expira_segundos": 600}


@router.post("/telegram/desvincular", summary="M5: desvincular Telegram y liberar el número")
async def telegram_desvincular(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Libera el chat y el número de la cuenta: `telegram_chat_id=NULL`,
    `telefono_whatsapp=NULL`, `telefono_verificado=False` y quema los
    vínculos pendientes del usuario (sus enlaces viejos dejan de valer).

    Es una liberación TOTAL a propósito: con el número aún guardado (aunque
    sin verificar) la regla anti-duplicados seguiría bloqueando a otra
    cuenta que lo reclame. La UI exige confirmación explícita porque se
    pierde la verificación (+20 pts) y la capacidad de publicar hasta
    registrar otro número. Idempotente (repetirla no falla).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    # Caché L1 en memoria: invalida los vínculos previos del usuario.
    for _k, _v in list(_TELEGRAM_VINCULOS.items()):
        if _v.get("user_id") == uid and not _v.get("usado"):
            _v["usado"] = True
            _TELEGRAM_USADOS.add(_k)
    for _c, _n in list(_TELEGRAM_PENDIENTES.items()):
        _rec = _TELEGRAM_VINCULOS.get(_n)
        if _rec is not None and _rec.get("user_id") == uid:
            _TELEGRAM_PENDIENTES.pop(_c, None)
    try:
        from app.models import Usuario, TelegramVinculo
        u = await db.get(Usuario, uid)
        if u:
            u.telegram_chat_id = None
            u.telefono_whatsapp = None
            u.telefono_verificado = False
            await db.execute(
                TelegramVinculo.__table__.update().where(
                    TelegramVinculo.usuario_id == uid,
                    TelegramVinculo.usado.is_(False),
                ).values(usado=True)
            )
            await db.commit()
            await db.refresh(u)
            return {"desvinculado": True,
                    "mensaje": "Telegram desvinculado y número liberado."}
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "telegram_desvincular")
        logger.error(f"[telegram desvincular] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


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


# ---------------------------------------------------------------------------
# Opción A: verificación por contacto (request_contact, $0).
# El /start solo REGISTRA qué chat pidió el enlace; la vinculación exige
# que el número de esa cuenta Telegram coincida con el teléfono VERIFICADO
# (OTP) del perfil AlojaU. Sin esto, cualquiera con el enlace (reenviado o
# sesión comprometida) vincularía su propio Telegram y recibiría los OTP.
# ---------------------------------------------------------------------------
_TELEGRAM_PENDIENTES: dict[str, str] = {}  # chat_id -> nonce (espejo memoria/dev)


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
    whatsapp, _ = _telefono_verificado_de(usuario)
    if not whatsapp:
        return await _rechazar_contacto(db, chat_id, "sin-telefono", pend)
    digitos10 = digitos_nacionales(contacto.get("phone_number"))
    if await _telefono_o_chat_en_uso(db, digitos10, str(chat_id), uid) is not None:
        return await _rechazar_contacto(db, chat_id, "duplicado", pend)
    if not _contacto_coincide(contacto.get("phone_number"), whatsapp):
        ultimos = (digitos10 or "")[-4:] or "????"
        return await _rechazar_contacto(db, chat_id, "numero-distinto", pend, ultimos=ultimos)
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
        usuario.telegram_chat_id = str(chat_id)
        usuario.telefono_verificado = True
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
    whatsapp, _ = _telefono_verificado_de(usuario)
    if not whatsapp:
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


def _telefono_verificado_de(usuario) -> tuple:
    """(whatsapp, verificado) del usuario."""
    return getattr(usuario, "telefono_whatsapp", None), bool(getattr(usuario, "telefono_verificado", False))


def _contacto_coincide(contact_phone, whatsapp) -> bool:
    """True si el contacto de Telegram corresponde al guardado en AlojaU.

    La prueba de titularidad LA DA Telegram (el servidor garantiza que un
    `contact` con `user_id == remitente` es el número real de esa cuenta,
    verificado por SMS al crearla). Aquí solo se compara contra el número
    que el usuario guardó en su perfil, por últimos 10 dígitos.
    """
    if not whatsapp:
        return False
    a = digitos_nacionales(contact_phone)
    b = digitos_nacionales(whatsapp)
    return bool(a) and a == b


async def _telefono_o_chat_en_uso(db: AsyncSession, digitos10: str | None,
                                  chat_id: str, excluir_uid: int) -> str | None:
    """Detecta reuso por OTRA cuenta activa. Retorna "telefono", "telegram" o None.

    - Teléfono: otro usuario activo cuyo número termine en los mismos 10
      dígitos (cubre variantes con/sin 57) vía SQL RIGHT().
    - Telegram: otro usuario con el mismo `telegram_chat_id`.
    Cuentas en soft-delete (`eliminado_en`) no cuentan (su número se libera).
    Si la BD falla, propaga el error (fail-closed: nunca se vincula sin
    comprobar unicidad).
    """
    try:
        from app.models import Usuario
        if digitos10:
            res = await db.execute(
                select(Usuario).where(
                    Usuario.id != excluir_uid,
                    Usuario.eliminado_en.is_(None),
                    Usuario.telefono_whatsapp.is_not(None),
                    func.right(Usuario.telefono_whatsapp, 10) == digitos10,
                ).limit(1)
            )
            if res.scalars().first() is not None:
                return "telefono"
        res = await db.execute(
            select(Usuario).where(
                Usuario.id != excluir_uid,
                Usuario.eliminado_en.is_(None),
                Usuario.telegram_chat_id == str(chat_id),
            ).limit(1)
        )
        if res.scalars().first() is not None:
            return "telegram"
    except Exception as e:
        logger.error("[telegram] comprobación de unicidad falló: %s", exc_resumen(e))
        raise
    return None


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
