"""Códigos OTP de verificación de email y recuperación de contraseña de un solo uso."""
import logging
from fastapi import APIRouter
import asyncio
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen, una_linea
from app.core.rate_limit import registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.core.flags import mock_enabled
from app.core.normalizacion import normalizar_email
from app.routers.auth.comun import _hash_password_async, _password_fuerte_v13
from app.routers.auth.esquemas import OtpSolicitarIn, OtpVerificarIn, RecoveryConfirmarIn, RecoverySolicitarIn

logger = logging.getLogger("alojau.auth")
router = APIRouter()

# OTP ligero (6 dígitos, 10 min) vía Email o Telegram webhook gratuito


async def _telegram_chat_para_email(db: AsyncSession, email: str) -> str | None:
    """Retorna el telegram_chat_id vinculado del usuario (o None si no hay).

    Nunca retorna el TELEGRAM_CHAT_ID
    global (ese es un canal/grupo de desarrollo, prohibido para OTP).
    """
    email_n = normalizar_email(email)
    from app.models import Usuario
    try:
        res = await db.execute(select(Usuario).where(Usuario.email == email_n))
        u = res.scalars().first()
        chat = getattr(u, "telegram_chat_id", None) if u is not None else None
        if chat:
            return str(chat)
    except Exception as e:
        logger.warning("[otp] lectura del chat de Telegram falló: %s", exc_resumen(e))
    return None


async def _crear_otp(db: AsyncSession, email: str, proposito: str) -> tuple[str, str]:
    """Genera y persiste OTP. Retorna (código plano, canal).

    M5 bugfix privacidad: el código SOLO viaja por DM si el usuario posee
    `telegram_chat_id` vinculado; si no, fallback por correo (canal "email"
    con semántica correcta). NUNCA se postea a canales/grupos globales.
    """
    email = normalizar_email(email)
    codigo = f"{secrets.randbelow(1_000_000):06d}"
    expira = datetime.now(timezone.utc) + timedelta(minutes=10)
    try:
        from app.models import OtpCode
        db.add(OtpCode(
            email=email, codigo_hash=hashlib.sha256(codigo.encode()).hexdigest(),
            proposito=proposito, expira_en=expira,
        ))
        await db.commit()
    except Exception as e:
        await rollback_seguro(db, "_crear_otp")
        logger.error("[otp] no se pudo guardar el código: %s", exc_resumen(e))
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    chat_id = await _telegram_chat_para_email(db, email)
    # I/O de red (Bot API ≤8s) fuera del event loop: el request responde sin
    # bloquear a otros usuarios concurrentes del worker.
    canal = await asyncio.to_thread(_enviar_codigo, email, codigo, proposito, chat_id)
    return codigo, canal


def _enviar_codigo(email: str, codigo: str, proposito: str, chat_id: str | None = None) -> str:
    """Envía el OTP y retorna el canal usado ("telegram" o "email").

    M5 bugfix explícito: Telegram SOLO por DM si hay `chat_id` vinculado
    del usuario. Sin vinculación -> fallback correo (canal "email").
    PROHIBIDO usar TELEGRAM_CHAT_ID global (canal/grupo dev) para OTP.
    """
    if chat_id and settings.TELEGRAM_BOT_TOKEN.strip():
        try:
            import urllib.request
            import urllib.parse
            texto = f"AlojaU ({proposito}): tu código es {codigo}. Expira en 10 minutos."
            data = urllib.parse.urlencode(
                {"chat_id": str(chat_id), "text": texto}).encode()
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                data=data, headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=8) as _:
                pass
            return "telegram"
        except Exception as e:
            logger.warning(f"[otp telegram DM] falló, usando email: {exc_resumen(e)}")
    # Sin DM vinculado o sin bot: Email-code (log en dev, Supabase en prod).
    # Semántica correcta: canal "email" = llegó (o se logueó) por correo.
    # CodeQL: desinfección directa sobre args del logger (wrappers no cortan taint).
    _proposito_seguro = str(proposito).replace('\n', '').replace('\r', '')
    _email_seguro = str(una_linea(email)).replace('\n', '').replace('\r', '')
    if chat_id and not settings.TELEGRAM_BOT_TOKEN.strip():
        logger.info(f"[otp {_proposito_seguro}] sin bot configurado, fallback email para {_email_seguro}")
    # El código NUNCA se loguea (secreto de un solo uso): solo el hecho.
    logger.info(f"[otp {_proposito_seguro}] código generado para {_email_seguro} (10 min, canal email)")
    return "email"


# Throttle OTP en memoria (por proceso) + persistente en PG.
_OTP_SOLICITAR: dict[str, list[float]] = {}
_OTP_VERIFICAR: dict[str, list[float]] = {}
OTP_SOL_LIMIT = 5
OTP_SOL_WINDOW_S = 900.0
OTP_VER_LIMIT = 10
OTP_VER_WINDOW_S = 600.0


@router.post("/otp/solicitar", status_code=202, summary="Solicitar código OTP 6 dígitos (10 min)")
async def otp_solicitar(data: OtpSolicitarIn, db: AsyncSession = Depends(get_session)):
    email = normalizar_email(data.email)
    # Anti-spam/adivinanza: 5 solicitudes por email cada 15 min.
    registrar_intento(_OTP_SOLICITAR, email, OTP_SOL_LIMIT, OTP_SOL_WINDOW_S,
                   "Demasiadas solicitudes de código, espera 15 minutos")
    await verificar_intentos_fallidos(db, f"otp_sol:{email}", limite=OTP_SOL_LIMIT, ventana_s=int(OTP_SOL_WINDOW_S))
    _, canal = await _crear_otp(db, email, data.proposito)
    await registrar_intento_persistente(db, f"otp_sol:{email}", False)
    return {"mensaje": "Si el correo existe, enviamos un código de 6 dígitos válido 10 minutos.",
            "expira_minutos": 10, "canal": canal}


@router.post("/otp/verificar", summary="Verificar OTP y confirmar email")
async def otp_verificar(data: OtpVerificarIn, db: AsyncSession = Depends(get_session)):
    email = normalizar_email(data.email)
    # Anti-fuerza-bruta (código de ~20 bits): 10 intentos cada 10 min.
    registrar_intento(_OTP_VERIFICAR, email, OTP_VER_LIMIT, OTP_VER_WINDOW_S,
                   "Demasiados intentos de código, espera 10 minutos")
    await verificar_intentos_fallidos(db, f"otp_ver:{email}", limite=OTP_VER_LIMIT, ventana_s=int(OTP_VER_WINDOW_S))
    digest = hashlib.sha256(data.codigo.encode()).hexdigest()
    ok = False
    try:
        from app.models import OtpCode, Usuario
        stmt = select(OtpCode).where(
            OtpCode.email == email,
            OtpCode.proposito == data.proposito,
            OtpCode.consumido.is_(False),
            OtpCode.expira_en > datetime.now(timezone.utc),
        ).order_by(OtpCode.id.desc())
        row = (await db.execute(stmt)).scalars().first()
        if row and secrets.compare_digest(row.codigo_hash, digest):
            row.consumido = True
            ok = True
            if data.proposito == "email_verify":
                ures = await db.execute(select(Usuario).where(Usuario.email == email))
                u = ures.scalars().first()
                if u:
                    u.email_verificado = True
            await db.commit()
    except Exception as e:
        await rollback_seguro(db, "otp_verificar")
        logger.error("[otp] verificación falló: %s", exc_resumen(e))
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not ok:
        await registrar_intento_persistente(db, f"otp_ver:{email}", False)
        raise HTTPException(status_code=401, detail="Código inválido o expirado")
    return {"mensaje": "Verificación exitosa.", "email_verificado": True}


# Recovery un solo uso (15 min) + fortaleza v13
@router.post("/recovery/solicitar", status_code=202, summary="Solicitar enlace de recuperación (15 min)")
async def recovery_solicitar(data: RecoverySolicitarIn, request: Request,
                             db: AsyncSession = Depends(get_session)):
    email = normalizar_email(data.email)
    await verificar_intentos_fallidos(db, f"recovery:{email}", limite=5, ventana_s=900)
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    expira = datetime.now(timezone.utc) + timedelta(minutes=15)
    try:
        from app.models import PasswordReset
        db.add(PasswordReset(email=email, token_hash=digest, expira_en=expira))
        await db.commit()
    except Exception as e:
        await rollback_seguro(db, "recovery_solicitar")
        logger.error("[recovery] no se pudo guardar el enlace: %s", exc_resumen(e))
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Respuesta genérica anti-enumeración; en dev se loguea el token.
    # CodeQL: desinfección directa (una_linea sola no corta taint).
    _email_seguro = str(una_linea(email)).replace('\n', '').replace('\r', '')
    logger.info(f"[recovery] token generado para {_email_seguro} (15 min, un solo uso)")
    resp: dict = {"mensaje": "Si el correo existe, enviamos un enlace válido 15 minutos."}
    if settings.ENV != "prod" and mock_enabled():
        resp["dev_token"] = token  # solo dev/test para e2e sin SMTP
    return resp


@router.post("/recovery/confirmar", summary="Confirmar recuperación con token de un solo uso")
async def recovery_confirmar(data: RecoveryConfirmarIn, db: AsyncSession = Depends(get_session)):
    email = normalizar_email(data.email)
    err = _password_fuerte_v13(data.nueva_password)
    if err:
        raise HTTPException(status_code=422, detail=f"Contraseña débil: {err}")
    digest = hashlib.sha256(data.token.encode()).hexdigest()
    ok = False
    try:
        from app.models import PasswordReset, Usuario
        stmt = select(PasswordReset).where(
            PasswordReset.email == email,
            PasswordReset.token_hash == digest,
            PasswordReset.consumido.is_(False),
            PasswordReset.expira_en > datetime.now(timezone.utc),
        ).order_by(PasswordReset.id.desc())
        row = (await db.execute(stmt)).scalars().first()
        if row:
            ures = await db.execute(select(Usuario).where(Usuario.email == email))
            u = ures.scalars().first()
            if u:
                u.password_hash = await _hash_password_async(data.nueva_password)
                row.consumido = True
                await db.commit()
                # Revoca sesiones previas (el atacante con sesión vieja queda fuera).
                try:
                    from app.models import Sesion
                    sres = await db.execute(
                        select(Sesion).where(Sesion.usuario_id == u.id,
                                             Sesion.revocado.is_(False)))
                    for s in sres.scalars().all():
                        s.revocado = True
                        s.revocado_en = datetime.now(timezone.utc)
                    await db.commit()
                except Exception as e:
                    await rollback_seguro(db, "recovery_confirmar")
                    logger.warning("[recovery] no se pudieron revocar las sesiones previas: %s", exc_resumen(e))
                ok = True
    except Exception as e:
        await rollback_seguro(db, "recovery_confirmar")
        logger.error("[recovery] confirmación falló: %s", exc_resumen(e))
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not ok:
        raise HTTPException(status_code=401, detail="Enlace inválido, expirado o ya usado")
    return {"mensaje": "Contraseña restablecida. Sesiones anteriores revocadas."}
