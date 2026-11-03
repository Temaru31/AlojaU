"""Vinculación de Telegram y verificación telefónica gratuita por webhook."""
import logging
from fastapi import APIRouter
import secrets
import time
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.rate_limit import registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session

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

# ---------------------------------------------------------------------------
# Opción A: verificación por contacto (request_contact, $0).
# El /start solo REGISTRA qué chat pidió el enlace; la vinculación exige
# que el número de esa cuenta Telegram coincida con el teléfono VERIFICADO
# (OTP) del perfil AlojaU. Sin esto, cualquiera con el enlace (reenviado o
# sesión comprometida) vincularía su propio Telegram y recibiría los OTP.
# ---------------------------------------------------------------------------
_TELEGRAM_PENDIENTES: dict[str, str] = {}  # chat_id -> nonce (espejo memoria/dev)


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
