"""Auth: Resource Server OIDC (Keycloak) - valida JWT RS256 vía JWKS.

Los access tokens de Keycloak llegan por "Authorization: Bearer <token>" y se
validan contra el JWKS del realm (KEYCLOAK_URL/KEYCLOAK_REALM). Solo existen
dos roles: "admin" y "landlord"; se leen de realm_access / resource_access y se
normalizan a user["roles"] (minúsculas) y user["rol"] ("ADMIN" | "LANDLORD").
Sin Keycloak configurado se conserva el fallback legacy: JWT HS256 propio +
mock solo dev.

Uso: Depends(get_current_user/require_landlord/require_landlord_or_admin/require_admin) en routers.
Ej: headers {"Authorization": "Bearer <token-keycloak>"} -> {"roles":["admin"],"rol":"ADMIN","email":...}."""
import logging
import jwt  # PyJWT (RS256 via JWKS + HS256 legacy)
from fastapi import HTTPException, Header
from .config import settings

logger = logging.getLogger("alojau.security")

# --- Legacy (sin Keycloak): decodificar JWT HS256 propio ----------------------

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

# --- Keycloak (OIDC): validar JWT RS256 contra JWKS del realm ----------------

_jwks_client = None

def _get_jwks_client():
    """Clients JWKS cacheado de Keycloak (PyJWT refetcha el kid si cambió la key)."""
    global _jwks_client
    if _jwks_client is None:
        from jwt import PyJWKClient
        _jwks_client = PyJWKClient(settings.keycloak_jwks_url)
    return _jwks_client

def _decode_keycloak_token(token: str):
    if not settings.keycloak_configured:
        return None
    try:
        key = _get_jwks_client().get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as e:
        logger.debug(f"[keycloak] token rechazado: {e!r}")
        return None
    except Exception as e:
        logger.warning(f"[keycloak] JWKS no disponible: {e!r}")
        return None

def _keycloak_roles(payload: dict) -> set:
    """Realm roles (realm_access.roles) + client roles (resource_access.<cliente>.roles), en minúsculas."""
    roles = set()
    ra = payload.get("realm_access")
    if isinstance(ra, dict) and isinstance(ra.get("roles"), list):
        roles.update(str(r).lower() for r in ra["roles"])
    rsrc = payload.get("resource_access")
    if isinstance(rsrc, dict):
        for client in rsrc.values():
            if isinstance(client, dict) and isinstance(client.get("roles"), list):
                roles.update(str(r).lower() for r in client["roles"])
    return roles

def _keycloak_to_user(payload: dict) -> dict:
    roles = _keycloak_roles(payload)
    if "admin" in roles:
        rol = "ADMIN"
    elif "landlord" in roles or "arrendador" in roles:
        rol = "LANDLORD"
    else:
        rol = "LANDLORD"  # por defecto: landlord/arrendador
    email = payload.get("email") or payload.get("preferred_username") or payload.get("sub")
    nombre = payload.get("name") or payload.get("preferred_username") or email
    return {
        "sub": payload.get("sub") or email,
        "email": email,
        "nombre_completo": nombre,
        "roles": sorted(roles),
        "rol": rol,
        # Keycloak no tiene el id numérico de nuestra BD; los routers resuelven por email.
        "id": None,
        "telefono_verificado": rol == "ADMIN",
    }

# Mock para demo sin BD (desactivado en prod)
MOCK_TOKENS = {
    "mock-token-arrendador": {"sub": "arrendador@alojau.com", "roles": ["landlord"], "rol": "LANDLORD", "id": 1, "telefono_verificado": True},
    "mock-token-admin": {"sub": "admin@alojau.com", "roles": ["admin"], "rol": "ADMIN", "id": 2, "telefono_verificado": True},
}
def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.strip():
        raise HTTPException(status_code=401, detail="Falta Bearer token")
    # Normaliza: "Bearer <token>" case-insensitive, permite espacios extra
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Formato Bearer token inválido")
    token = parts[1].strip()
    # B0-2 fail-closed: mock solo si mock_enabled (flag True + ENV!=prod).
    mock_ok = bool(getattr(settings, "mock_enabled", False))
    if mock_ok and token in MOCK_TOKENS:
        return MOCK_TOKENS[token]
    # Keycloak primero (si está configurado): token válido -> perfil con roles.
    if settings.keycloak_configured:
        payload = _decode_keycloak_token(token)
        if payload is not None:
            return _keycloak_to_user(payload)
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return decode_token(token)

def get_optional_user(authorization: str | None = Header(None)):
    # Auth opcional: ausente/inválido (401) -> None; otro error se propaga.
    if not authorization or not authorization.strip():
        return None
    try:
        return get_current_user(authorization)
    except HTTPException as e:
        if e.status_code == 401:
            return None
        raise

def _has_role(user: dict, *nombres: str) -> bool:
    """Compat: rol clave (ADMIN/LANDLORD) o rol crudo Keycloak (admin/landlord/arrendador)."""
    if user.get("rol") in nombres:
        return True
    roles = {str(r).lower() for r in (user.get("roles") or [])}
    return bool(roles & {str(n).lower() for n in nombres})

def require_landlord(authorization: str = Header(None)):
    u = get_current_user(authorization)
    if not _has_role(u, "LANDLORD", "landlord", "arrendador"):
        raise HTTPException(status_code=403, detail="Solo Landlord")
    return u

# Alias legacy para compatibilidad.
require_arrendador = require_landlord

def require_landlord_or_admin(authorization: str = Header(None)):
    """Protección base de la plataforma: cualquier rol válido (Landlord o admin)."""
    u = get_current_user(authorization)
    if not _has_role(u, "LANDLORD", "ADMIN", "landlord", "admin", "arrendador"):
        raise HTTPException(status_code=403, detail="No autorizado")
    return u

def require_admin(authorization: str = Header(None)):
    # B0-3: guard ADMIN para moderación (Keycloak "admin" | legacy "ADMIN"). 401 sin token, 403 si no admin.
    u = get_current_user(authorization)
    if not _has_role(u, "ADMIN", "admin"):
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    return u


# Alias con nombre explícito para endpoints de administración (RBAC).
# Uso: user: dict = Depends(get_current_admin_user). Equivale a require_admin.
get_current_admin_user = require_admin