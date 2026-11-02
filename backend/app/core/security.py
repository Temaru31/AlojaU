"""JWT HS256 + bcrypt con fail-closed en prod (mock solo dev).
Uso: Depends(get_current_user/require_arrendador/require_admin) en routers. Ej: headers {"Authorization": "Bearer <jwt>"} -> {"id":1,"rol":"ARRENDADOR"}.
v13: los tokens nuevos incluyen `jti` (revocación) y `scopes` (RBAC granular).
Los tokens legacy sin scopes se enriquecen por rol (compat total).
v14.1: get_current_user es async y verifica revocación JTI en TODOS los
endpoints autenticados (centralizado). Exenciones: mock-tokens (solo dev),
tokens sin jti (legacy, máx 8h de vida). Prod + error DB -> 503 fail-closed;
dev/mock + error DB -> permite con warning (resiliencia local)."""
from datetime import datetime, timezone, timedelta
import logging
import time
import uuid
import jwt  # OLA1: PyJWT (reemplaza python-jose abandonado); HS256 + require exp/sub
import bcrypt as _bcrypt
from app.core.logseguro import exc_resumen
from fastapi import HTTPException, Header
from .config import settings
from app.core.flags import mock_enabled
from app.core.dominio import Rol
logger = logging.getLogger("alojau.security")

# Passlib está abandonado (último release 2020) y rompía con
# bcrypt 4.1+ (ValueError 72 bytes). Se usa bcrypt directo (ya pineado a
# 4.0.1): mismos hashes $2b$ verificables con los seeds existentes.
def _pw_bytes(p) -> bytes:
    return str(p or "").encode("utf-8")[:72]


def hash_password(p) -> str:
    return _bcrypt.hashpw(_pw_bytes(p), _bcrypt.gensalt()).decode("utf-8")


def verify_password(p, h) -> bool:
    try:
        return _bcrypt.checkpw(_pw_bytes(p), str(h or "").encode("utf-8"))
    except Exception:
        return False
def create_token(data: dict):
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {**data, "exp": exp}
    payload.setdefault("jti", uuid.uuid4().hex)
    # Inyecta scopes derivados del rol si el caller no los fijó.
    if "scopes" not in payload and payload.get("rol"):
        from app.core.permissions import scopes_for_role
        payload["scopes"] = sorted(scopes_for_role(payload.get("rol")))
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
def decode_token(token: str):
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub"]},  # OLA1: rechaza tokens sin expiración ni sujeto
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# Mock para demo sin BD (desactivado en prod)
# Incluye ESTUDIANTE base (rol por defecto de registro nuevo).
MOCK_TOKENS = {
    "mock-token-arrendador": {"sub": "arrendador@alojau.com", "rol": Rol.ARRENDADOR, "id": 1, "telefono_whatsapp": "573001234567", "telefono_verificado": True, "email_verificado": True},
    "mock-token-admin": {"sub": "admin@alojau.com", "rol": Rol.ADMIN, "id": 2, "telefono_whatsapp": "573009998877", "telefono_verificado": True, "email_verificado": True},
    "mock-token-estudiante": {"sub": "estudiante@alojau.com", "rol": Rol.ESTUDIANTE, "id": 3, "telefono_whatsapp": "573001112233", "telefono_verificado": False, "email_verificado": False},
    "mock-token-auditor": {"sub": "auditor@alojau.com", "rol": Rol.AUDITOR_LEGAL, "id": 4, "telefono_whatsapp": "573001112244", "telefono_verificado": False, "email_verificado": True},
}

async def _verificar_sesion_activa(claims: dict, db=None) -> None:
    """401 si el jti está revocado en `sesiones`.

    Exento (sin consulta): tokens sin jti (legacy y mock-tokens dev, que no
    lo traen). Error DB: prod -> 503 fail-closed con log; dev/mock ->
    warning + permite (resiliencia local sin PG).
    """
    jti = (claims or {}).get("jti")
    if not jti:
        return
    try:
        from sqlalchemy import select as _select
        from app.models import Sesion as _Sesion
        if db is None:
            from app.db.session import AsyncSession as _Factory
            async with _Factory() as _s:
                res = await _s.execute(_select(_Sesion).where(_Sesion.jti == jti))
                row = res.scalars().first()
        else:
            res = await db.execute(_select(_Sesion).where(_Sesion.jti == jti))
            row = res.scalars().first()
        if row is not None and bool(getattr(row, "revocado", False)):
            raise HTTPException(status_code=401, detail="Sesión revocada")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[security] verificación de sesión falló (fail-closed): %s", exc_resumen(e))
        if mock_enabled():
            logger.warning("[security] sin PG en dev: revocación no verificable (se permite)")
            return
        raise HTTPException(status_code=503, detail="Servicio de autenticación no disponible")


async def get_current_user(authorization: str = Header(None), db=None):
    if not authorization or not authorization.strip():
        raise HTTPException(status_code=401, detail="Falta Bearer token")
    # Normaliza: "Bearer <token>" case-insensitive, permite espacios extra
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Formato Bearer token inválido")
    token = parts[1].strip()
    # Fail-closed: mock solo si mock_enabled (flag True + ENV!=prod).
    if mock_enabled() and token in MOCK_TOKENS:
        return MOCK_TOKENS[token]
    # Cablea AuthService agnóstico (Supabase RS256/ES256 si
    # está configurado, si no local HS256). Sin Supabase el comportamiento
    # es idéntico a decode_token (compat total con tokens legacy).
    # La verificación Supabase incluye fetch JWKS (red ≤8s en cache-miss):
    # corre fuera del event loop para no serializar el worker.
    try:
        import asyncio as _aio
        from app.core.auth_service import decode_token_provider_agnostic as _agn
        claims = await _aio.to_thread(_agn, token)
    except HTTPException:
        raise
    except Exception:
        claims = decode_token(token)
    # Revocación central (todos los Depends la heredan).
    await _verificar_sesion_activa(claims, db)
    return claims

async def get_optional_user(authorization: str | None = Header(None)):
    # Auth opcional: ausente/inválido (401) -> None; otro error se propaga.
    # 503 de revocación SÍ se propaga (no enmascarar fail-closed).
    if not authorization or not authorization.strip():
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException as e:
        if e.status_code == 401:
            return None
        raise

# Caché de rol 60s para /upload* (1 query extra por request a 5.000 usuarios
# degradaría Render/Supabase). Solo cachea el caso positivo ARRENDADOR; el
# negativo siempre re-verifica (fail-closed ante democión reciente).
_ROL_CACHE: dict[int, tuple[str, float]] = {}
_ROL_CACHE_TTL_S = 60.0


def clear_rol_cache_for_tests() -> None:
    _ROL_CACHE.clear()


async def require_arrendador(authorization: str = Header(None)):
    """Guard ARRENDADOR. El rol real manda sobre el claim (anti-staleness):
    un token emitido antes de la auto-promoción dice ESTUDIANTE."""
    u = await get_current_user(authorization)
    if u.get("rol") == Rol.ARRENDADOR:
        return u
    uid = u.get("id")
    if isinstance(uid, int) and await _es_arrendador_real(uid):
        con_rol = {**u, "rol": Rol.ARRENDADOR}
        con_rol.pop("scopes", None)  # los scopes se derivan del rol real
        return con_rol
    raise HTTPException(status_code=403, detail="Solo ARRENDADOR")


async def require_admin(authorization: str = Header(None)):
    """Guard ADMIN para moderación. 401 sin token, 403 si no ADMIN.

    El claim ADMIN se REVALIDA contra BD en cada llamada (vigencia del JWT 2h):
    un ADMIN democionado pierde el panel de inmediato. Un claim no-ADMIN da 403
    sin consultar (nadie se promueve solo). Sin PG en dev, manda el claim mock.
    """
    u = await get_current_user(authorization)
    if u.get("rol") != Rol.ADMIN:
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    uid = u.get("id")
    if not isinstance(uid, int):
        return _claim_admin_solo_en_mock(u)
    try:
        rol = await _rol_en_bd(uid)
    except Exception as e:
        if mock_enabled():
            return u
        logger.warning("[security] verificación de rol ADMIN falló: %s", exc_resumen(e))
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    if rol == Rol.ADMIN:
        return {**u, "rol": Rol.ADMIN}
    if rol is not None:
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    return _claim_admin_solo_en_mock(u)


def _claim_admin_solo_en_mock(u: dict) -> dict:
    """Sin usuario verificable en BD, el claim ADMIN solo vale en dev/mock."""
    if mock_enabled():
        return u
    raise HTTPException(status_code=403, detail="Solo ADMIN")


async def _es_arrendador_real(uid: int) -> bool:
    """Caché positiva -> BD -> MOCK_USERS (solo si la BD cae en dev)."""
    ahora = time.monotonic()
    hit = _ROL_CACHE.get(uid)
    if hit and hit[0] == Rol.ARRENDADOR and (ahora - hit[1]) < _ROL_CACHE_TTL_S:
        return True
    try:
        rol = await _rol_en_bd(uid)
    except Exception as e:
        rol = _rol_mock(uid) if mock_enabled() else None
        if rol != Rol.ARRENDADOR:
            logger.warning("[security] verificación de rol ARRENDADOR falló: %s", exc_resumen(e))
    if rol != Rol.ARRENDADOR:
        return False
    _ROL_CACHE[uid] = (Rol.ARRENDADOR, ahora)
    return True


async def _rol_en_bd(uid: int) -> str | None:
    """Rol actual del usuario (None si no existe). Propaga los errores de BD."""
    from sqlalchemy import select
    from app.models import Usuario
    from app.db.session import AsyncSession as SessionFactory
    async with SessionFactory() as sesion:
        res = await sesion.execute(select(Usuario).where(Usuario.id == uid))
        usuario = res.scalars().first()
        return usuario.rol if usuario is not None else None


def _rol_mock(uid: int) -> str | None:
    from app.fixtures.usuarios_demo import MOCK_USERS
    return next((m.get("rol") for m in MOCK_USERS.values() if m.get("id") == uid), None)


# Revalidación ADMIN para editar avisos ajenos (caché 10s; el negativo no se cachea).
_ADMIN_REVALID_MEM: dict[int, tuple[float, bool]] = {}
_ADMIN_REVALID_TTL_S = 10.0


def clear_admin_revalid_for_tests() -> None:
    _ADMIN_REVALID_MEM.clear()


async def es_dueno_o_admin(user: dict | None, owner_id: int | None) -> bool:
    """Dueño por id, o ADMIN revalidado contra BD (anti-stale, caché 10s).

    El claim ADMIN del JWT (2h) no basta: un admin democionado no debe seguir
    viendo/editando avisos ajenos. Sin PG en dev con mocks, manda el claim.
    """
    if not user:
        return False
    try:
        if owner_id is not None and int(user.get("id")) == int(owner_id):
            return True
    except (TypeError, ValueError):
        pass  # id ausente o no numérico: no es el dueño
    uid = user.get("id")
    if user.get("rol") != Rol.ADMIN or not isinstance(uid, int):
        return False
    ahora = time.monotonic()
    hit = _ADMIN_REVALID_MEM.get(uid)
    if hit and hit[1] and (ahora - hit[0]) < _ADMIN_REVALID_TTL_S:
        return True
    try:
        es_admin = await _rol_en_bd(uid) == Rol.ADMIN
    except Exception as e:
        if mock_enabled():
            return True
        logger.warning("[security] revalidación ADMIN falló (se deniega): %s", exc_resumen(e))
        return False
    if es_admin:
        _ADMIN_REVALID_MEM[uid] = (ahora, True)
    return es_admin


# Alias con nombre explícito para endpoints de administración (RBAC).
# Uso: user: dict = Depends(get_current_admin_user). Equivale a require_admin.
get_current_admin_user = require_admin
