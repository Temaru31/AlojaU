"""Emisión y decodificación de JWT HS256 propios; tokens fijos de prueba (dev/test)."""
from datetime import datetime, timezone, timedelta
import uuid
import jwt
from fastapi import HTTPException
from app.core.config import settings
from app.core.dominio import Rol


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


# Tokens fijos de prueba (dev/test, USE_MOCK_FALLBACK; nunca en prod).
# Incluye ESTUDIANTE base (rol por defecto de registro nuevo).
MOCK_TOKENS = {
    "mock-token-arrendador": {
        "sub": "arrendador@alojau.com",
        "rol": Rol.ARRENDADOR,
        "id": 1,
        "telefono_whatsapp": "573001234567",
        "telefono_verificado": True,
        "email_verificado": True,
    },
    "mock-token-admin": {
        "sub": "admin@alojau.com",
        "rol": Rol.ADMIN,
        "id": 2,
        "telefono_whatsapp": "573009998877",
        "telefono_verificado": True,
        "email_verificado": True,
    },
    "mock-token-estudiante": {
        "sub": "estudiante@alojau.com",
        "rol": Rol.ESTUDIANTE,
        "id": 3,
        "telefono_whatsapp": "573001112233",
        "telefono_verificado": False,
        "email_verificado": False,
    },
    "mock-token-auditor": {
        "sub": "auditor@alojau.com",
        "rol": Rol.AUDITOR_LEGAL,
        "id": 4,
        "telefono_whatsapp": "573001112244",
        "telefono_verificado": False,
        "email_verificado": True,
    },
}
