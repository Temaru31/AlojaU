"""Dependencias FastAPI de autenticación y autorización: revocación, roles y dueño."""
import logging
import time
from app.core.logseguro import exc_resumen
from contextlib import asynccontextmanager
from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.flags import mock_enabled
from app.core.dominio import Rol
from app.core.security.claims import ClaimsUsuario
from app.core.security.tokens import MOCK_TOKENS, decode_token

logger = logging.getLogger("alojau.security")


@asynccontextmanager
async def _sesion(db):
    """La sesión inyectada en la petición o, en llamadas directas (scripts,
    pruebas), una propia. FastAPI pasa a los guards la misma sesión que al
    endpoint (Depends se resuelve una vez por petición)."""
    if db is not None and hasattr(db, "execute"):
        yield db
        return
    from app.db.session import AsyncSession as _Factory
    async with _Factory() as propia:
        yield propia


async def _verificar_sesion_activa(claims: dict, db=None) -> None:
    """401 si el jti está revocado en `sesiones`.

    Exento (sin consulta): tokens sin jti (legacy y mock-tokens dev, que no
    lo traen). Error de BD -> 503 fail-closed con log.
    """
    jti = (claims or {}).get("jti")
    if not jti:
        return
    try:
        from sqlalchemy import select as _select
        from app.models import Sesion as _Sesion
        # Solo la columna: no deja objetos ORM en la sesión del endpoint.
        async with _sesion(db) as s:
            revocado = (await s.execute(_select(_Sesion.revocado).where(_Sesion.jti == jti))).scalar()
        if revocado:
            raise HTTPException(status_code=401, detail="Sesión revocada")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[security] verificación de sesión falló (fail-closed): %s", exc_resumen(e))
        raise HTTPException(status_code=503, detail="Servicio de autenticación no disponible")


async def get_current_user(authorization: str = Header(None),
                           db: AsyncSession = Depends(get_session)) -> ClaimsUsuario:
    if not authorization or not authorization.strip():
        raise HTTPException(status_code=401, detail="Falta Bearer token")
    # Normaliza: "Bearer <token>" case-insensitive, permite espacios extra
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Formato Bearer token inválido")
    token = parts[1].strip()
    # Tokens de prueba solo si están habilitados (flag True + ENV!=prod).
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

async def get_optional_user(authorization: str | None = Header(None),
                            db: AsyncSession = Depends(get_session)) -> ClaimsUsuario | None:
    # Auth opcional: ausente/inválido (401) -> None; otro error se propaga.
    # 503 de revocación SÍ se propaga (no enmascarar fail-closed).
    if not authorization or not authorization.strip():
        return None
    try:
        return await get_current_user(authorization, db)
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


async def require_arrendador(authorization: str = Header(None),
                            db: AsyncSession = Depends(get_session)) -> ClaimsUsuario:
    """Guard ARRENDADOR. El rol real manda sobre el claim (anti-staleness):
    un token emitido antes de la auto-promoción dice ESTUDIANTE."""
    u = await get_current_user(authorization, db)
    if u.get("rol") == Rol.ARRENDADOR:
        return u
    uid = u.get("id")
    if isinstance(uid, int) and await _es_arrendador_real(uid, db):
        con_rol = {**u, "rol": Rol.ARRENDADOR}
        con_rol.pop("scopes", None)  # los scopes se derivan del rol real
        return con_rol
    raise HTTPException(status_code=403, detail="Solo ARRENDADOR")


async def require_admin(authorization: str = Header(None),
                        db: AsyncSession = Depends(get_session)) -> ClaimsUsuario:
    """Guard ADMIN para moderación. 401 sin token, 403 si no ADMIN.

    El claim ADMIN se REVALIDA contra BD en cada llamada (vigencia del JWT 2h):
    un ADMIN democionado pierde el panel de inmediato. Un claim no-ADMIN da 403
    sin consultar (nadie se promueve solo). Usuario inexistente -> 403; BD caída -> 503 (fail-closed).
    """
    u = await get_current_user(authorization, db)
    if u.get("rol") != Rol.ADMIN:
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    uid = u.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    try:
        rol = await _rol_en_bd(uid, db)
    except Exception as e:
        raise _rol_no_verificable("ADMIN", e)
    if rol != Rol.ADMIN:
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    return {**u, "rol": Rol.ADMIN}


async def _es_arrendador_real(uid: int, db=None) -> bool:
    """Caché positiva (60s) o rol actual en BD; si la BD falla, 503 (fail-closed)."""
    ahora = time.monotonic()
    hit = _ROL_CACHE.get(uid)
    if hit and hit[0] == Rol.ARRENDADOR and (ahora - hit[1]) < _ROL_CACHE_TTL_S:
        return True
    try:
        rol = await _rol_en_bd(uid, db)
    except Exception as e:
        raise _rol_no_verificable("ARRENDADOR", e)
    if rol != Rol.ARRENDADOR:
        return False
    _ROL_CACHE[uid] = (Rol.ARRENDADOR, ahora)
    return True


def _rol_no_verificable(rol: str, e: Exception) -> HTTPException:
    """BD caída al revalidar el rol: 503 fail-closed (se deniega, pero sin
    disfrazar la caída de "no tienes permiso"), igual que la revocación."""
    logger.error("[security] verificación de rol %s falló (fail-closed): %s", rol, exc_resumen(e))
    return HTTPException(status_code=503, detail="Servicio de autenticación no disponible")


async def _rol_en_bd(uid: int, db=None) -> str | None:
    """Rol actual del usuario (None si no existe). Propaga los errores de BD.

    Solo la columna `rol`: no deja un `Usuario` cacheado en la sesión del
    endpoint (que luego podría leerlo con un FOR UPDATE y verlo rancio).
    """
    from sqlalchemy import select
    from app.models import Usuario
    async with _sesion(db) as s:
        return (await s.execute(select(Usuario.rol).where(Usuario.id == uid))).scalar()


# Revalidación ADMIN para editar avisos ajenos (caché 10s; el negativo no se cachea).
_ADMIN_REVALID_MEM: dict[int, tuple[float, bool]] = {}
_ADMIN_REVALID_TTL_S = 10.0


def clear_admin_revalid_for_tests() -> None:
    _ADMIN_REVALID_MEM.clear()


async def es_dueno_o_admin(user: ClaimsUsuario | None, owner_id: int | None, db=None) -> bool:
    """Dueño por id, o ADMIN revalidado contra BD (anti-stale, caché 10s).

    El claim ADMIN del JWT (2h) no basta: un admin democionado no debe seguir
    viendo/editando avisos ajenos.
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
        es_admin = await _rol_en_bd(uid, db) == Rol.ADMIN
    except Exception as e:
        logger.warning("[security] revalidación ADMIN falló (se deniega): %s", exc_resumen(e))
        return False
    if es_admin:
        _ADMIN_REVALID_MEM[uid] = (ahora, True)
    return es_admin


# Alias con nombre explícito para endpoints de administración (RBAC).
# Uso: user: ClaimsUsuario = Depends(get_current_admin_user). Equivale a require_admin.
get_current_admin_user = require_admin
