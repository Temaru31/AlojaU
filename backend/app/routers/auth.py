from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from ..core.security import hash_password, verify_password, create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Mock users (sin BD)
MOCK_USERS = {
    "arrendador@alojau.com": {"password": hash_password("AlojaU123"), "rol": "ARRENDADOR", "id": 1},
    "admin@alojau.com": {"password": hash_password("Admin123"), "rol": "ADMIN", "id": 2},
}

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    nombre_completo: str
    telefono_whatsapp: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/register", summary="Registro arrendador")
async def register(data: RegisterIn):
    if data.email in MOCK_USERS:
        raise HTTPException(400, "Email ya registrado (mock)")
    return {"id": 99, "email": data.email, "rol": "ARRENDADOR", "mock": True}

@router.post("/login", summary="Login JWT HS256 8h")
async def login(data: LoginIn):
    u = MOCK_USERS.get(data.email)
    if not u or not verify_password(data.password, u["password"]):
        raise HTTPException(401, "Credenciales inválidas")
    token = create_token({"sub": data.email, "rol": u["rol"], "id": u["id"]})
    return {"access_token": token, "token_type": "bearer", "expires_in_hours": 8, "rol": u["rol"]}
# Mock tokens para demo sin BD: mock-token-arrendador / mock-token-admin
