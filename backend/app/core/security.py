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
import uuid
import jwt  # OLA1: PyJWT (reemplaza python-jose abandonado); HS256 + require exp/sub
import bcrypt as _bcrypt
from fastapi import HTTPException, Header
from .config import settings
logger = logging.getLogger("alojau.security")

# Detalle #10: passlib está abandonado (último release 2020) y rompía con
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
    # v13: inyecta scopes derivados del rol si el caller no los fijó.
    if "scopes" not in payload and payload.get("rol"):
        try:
            from app.core.permissions import scopes_for_role
            payload["scopes"] = sorted(scopes_for_role(payload.get("rol")))
        except Exception:
            pass
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
# v13: incluye ESTUDIANTE base (rol por defecto de registro nuevo).
MOCK_TOKENS = {
    "mock-token-arrendador": {"sub": "arrendador@alojau.com", "rol": "ARRENDADOR", "id": 1, "telefono_whatsapp": "573001234567", "telefono_verificado": True, "email_verificado": True},
    "mock-token-admin": {"sub": "admin@alojau.com", "rol": "ADMIN", "id": 2, "telefono_whatsapp": "573009998877", "telefono_verificado": True, "email_verificado": True},
    "mock-token-estudiante": {"sub": "estudiante@alojau.com", "rol": "ESTUDIANTE", "id": 3, "telefono_whatsapp": "573001112233", "telefono_verificado": False, "email_verificado": False},
    "mock-token-auditor": {"sub": "auditor@alojau.com", "rol": "AUDITOR_LEGAL", "id": 4, "telefono_whatsapp": "573001112244", "telefono_verificado": False, "email_verificado": True},
}
def _mock_activo() -> bool:
    from .config import settings as _s
    return bool(getattr(_s, "mock_enabled", False))


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
        logger.error("[security] verificación de sesión falló (fail-closed): %r", e)
        if _mock_activo():
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
    if _mock_activo() and token in MOCK_TOKENS:
        return MOCK_TOKENS[token]
    # Detalle #10: cablea AuthService agnóstico (Supabase RS256 si está
    # configurado, si no local HS256). Sin Supabase el comportamiento es
    # idéntico a decode_token (compat total con tokens legacy).
    try:
        from app.core.auth_service import decode_token_provider_agnostic as _agn
        claims = _agn(token)
    except HTTPException:
        raise
    except Exception:
        claims = decode_token(token)
    # v14.1: revocación central (todos los Depends la heredan).
    await _verificar_sesion_activa(claims, db)
    return claims

async def get_optional_user(authorization: str | None = Header(None)):
    # Auth opcional: ausente/inválido (401) -> None; otro error se propaga.
    # v14.1: 503 de revocación SÍ se propaga (no enmascarar fail-closed).
    if not authorization or not authorization.strip():
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException as e:
        if e.status_code == 401:
            return None
        raise

# Detalle #5 free-tier: caché de rol 60s para /upload* (1 query extra por
# request a 5.000 usuarios degradaría Render/Supabase). Solo cachea el caso
# positivo ARRENDADOR; el negativo siempre re-verifica (fail-closed ante
# democión reciente). Limpieza en tests vía clear_rol_cache_for_tests().
import time as _time
_ROL_CACHE: dict[int, tuple[str, float]] = {}
_ROL_CACHE_TTL_S = 60.0


def clear_rol_cache_for_tests() -> None:
    _ROL_CACHE.clear()


async def require_arrendador(authorization: str = Header(None)):
    u = await get_current_user(authorization)
    if u.get("rol") == "ARRENDADOR":
        return u
    # v15.2 anti-staleness: un token emitido antes de la auto-promoción dice
    # ESTUDIANTE; la fuente de verdad manda (misma regla que el gate).
    # Orden: BD primero (vale con PG arriba aunque mock esté permitido);
    # MOCK_USERS solo si la BD falla en dev. Sin rol real -> 403 deny-default.
    try:
        uid = u.get("id")
        if isinstance(uid, int):
            ahora = _time.monotonic()
            hit = _ROL_CACHE.get(uid)
            if hit and hit[0] == "ARRENDADOR" and (ahora - hit[1]) < _ROL_CACHE_TTL_S:
                u = {**u, "rol": "ARRENDADOR"}
                u.pop("scopes", None)
                return u
            try:
                from sqlalchemy import select as _select
                from app.models import Usuario as _U
                from app.db.session import AsyncSession as _Factory
                async with _Factory() as _s:
                    res = await _s.execute(_select(_U).where(_U.id == uid))
                    row = res.scalars().first()
                    if row is not None and row.rol == "ARRENDADOR":
                        _ROL_CACHE[uid] = ("ARRENDADOR", ahora)
                        u = {**u, "rol": "ARRENDADOR"}
                        u.pop("scopes", None)
                        return u
            except Exception:
                if _mock_activo():
                    from app.routers.auth import MOCK_USERS as _MU
                    for _m in _MU.values():
                        if _m.get("id") == uid and _m.get("rol") == "ARRENDADOR":
                            _ROL_CACHE[uid] = ("ARRENDADOR", ahora)
                            u = {**u, "rol": "ARRENDADOR"}
                            u.pop("scopes", None)
                            return u
                raise
    except Exception as e:
        logger.warning("[security] verificación de rol ARRENDADOR falló: %r", e)
    raise HTTPException(status_code=403, detail="Solo ARRENDADOR")

async def require_admin(authorization: str = Header(None)):
    # Guard ADMIN para moderación. 401 sin token, 403 si no ADMIN.
    u = await get_current_user(authorization)
    if u.get("rol") != "ADMIN":
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    return u


# Alias con nombre explícito para endpoints de administración (RBAC).
# Uso: user: dict = Depends(get_current_admin_user). Equivale a require_admin.
get_current_admin_user = require_admin
