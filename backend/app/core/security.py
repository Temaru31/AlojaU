"""JWT HS256 + bcrypt con fail-closed en prod (mock solo dev).
Uso: Depends(get_current_user/require_arrendador/require_admin) en routers. Ej: headers {"Authorization": "Bearer <jwt>"} -> {"id":1,"rol":"ARRENDADOR"}."""
from datetime import datetime, timezone, timedelta
from jose import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Header
from .config import settings
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p): return pwd_ctx.hash(p)
def verify_password(p, h): return pwd_ctx.verify(p, h)
def create_token(data: dict):
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({**data, "exp": exp}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
def decode_token(token: str):
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# Mock para demo sin BD (desactivado en prod)
MOCK_TOKENS = {
    "mock-token-arrendador": {"sub": "arrendador@alojau.com", "rol": "ARRENDADOR", "id": 1, "telefono_verificado": True},
    "mock-token-admin": {"sub": "admin@alojau.com", "rol": "ADMIN", "id": 2, "telefono_verificado": True},
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
    from .config import settings
    mock_ok = bool(getattr(settings, "mock_enabled", False))
    if mock_ok and token in MOCK_TOKENS:
        return MOCK_TOKENS[token]
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

def require_arrendador(authorization: str = Header(None)):
    u = get_current_user(authorization)
    if u.get("rol") != "ARRENDADOR":
        raise HTTPException(status_code=403, detail="Solo ARRENDADOR")
    return u

def require_admin(authorization: str = Header(None)):
    # B0-3: guard ADMIN para moderación. 401 sin token, 403 si no ADMIN.
    u = get_current_user(authorization)
    if u.get("rol") != "ADMIN":
        raise HTTPException(status_code=403, detail="Solo ADMIN")
    return u
