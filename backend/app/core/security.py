"""JWT HS256 + bcrypt - Tabla16:27"""
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Header
from .config import settings
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p): return pwd_ctx.hash(p)
def verify_password(p, h): return pwd_ctx.verify(p, h)
def create_token(data: dict):
    exp = datetime.utcnow() + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
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
    # Mock solo si está habilitado (DoD-5)
    from .config import settings
    import os
    if settings.USE_MOCK_FALLBACK and os.getenv("ENV", "dev") != "prod" and token in MOCK_TOKENS:
        return MOCK_TOKENS[token]
    return decode_token(token)

def require_arrendador(authorization: str = Header(None)):
    u = get_current_user(authorization)
    if u.get("rol") != "ARRENDADOR":
        raise HTTPException(status_code=403, detail="Solo ARRENDADOR")
    return u
