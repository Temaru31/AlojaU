import time
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.security import hash_password, verify_password, create_token, get_current_user
from ..core.config import settings
from ..db.session import get_session

logger = logging.getLogger("alojau.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Mock users (sin BD, solo dev). Claves demo ÚNICAS: AlojaU123 (igual que seed_db.py).
MOCK_USERS = {
    "arrendador@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": "ARRENDADOR",
        "id": 1,
        "nombre_completo": "Arrendador Demo",
        "telefono_whatsapp": "573001234567",
        "telefono_verificado": False,
    },
    "admin@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": "ADMIN",
        "id": 2,
        "nombre_completo": "Administrador AlojaU",
        "telefono_whatsapp": "573009998877",
        "telefono_verificado": True,
    },
}

def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    nombre_completo: str = Field(min_length=3, max_length=150)
    telefono_whatsapp: str = Field(min_length=7, max_length=20)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PerfilOut(BaseModel):
    id: int
    email: EmailStr
    nombre_completo: str
    telefono_whatsapp: Optional[str] = None
    telefono_verificado: bool = False
    rol: str


class PerfilUpdateIn(BaseModel):
    # OLA2-M4: telefono_verificado es SOLO-LECTURA (lo calcula/muestra el backend).
    # Se removió del esquema para que ningún usuario pueda auto-otorgarse +20 de
    # confianza ni desbloquear su WhatsApp (antes: PATCH {telefono_verificado:true}).
    nombre_completo: Optional[str] = Field(default=None, min_length=3, max_length=150)
    telefono_whatsapp: Optional[str] = Field(default=None, min_length=7, max_length=20)


class RegisterOut(BaseModel):
    id: int
    email: EmailStr
    rol: str
    mock: bool = False


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # T2: fuente única settings (no hardcodear: create_token usa el mismo valor).
    expires_in_hours: int = settings.ACCESS_TOKEN_EXPIRE_HOURS
    rol: str
    mock: bool = False


class PasswordChangeIn(BaseModel):
    actual: str = Field(min_length=1, max_length=72)
    nueva: str = Field(min_length=8, max_length=72)


# Tarea 2: rate-limit simple para cambio de contraseña (5 intentos/min por
# usuario). Misma técnica que el login (B0-7): en memoria por proceso.
_PW_ATTEMPTS: dict[str, list[float]] = {}
PW_LIMIT = 5
PW_WINDOW_S = 60.0


def _check_password_rate_limit(uid: str) -> None:
    now = time.monotonic()
    hist = [t for t in _PW_ATTEMPTS.get(uid, []) if now - t < PW_WINDOW_S]
    if len(hist) >= PW_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiados intentos, espera 1 minuto")
    hist.append(now)
    _PW_ATTEMPTS[uid] = hist

# B0-7 rate-limit simple en memoria: 5 intentos/min por IP en /login -> 429.
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
LOGIN_LIMIT = 5
LOGIN_WINDOW_S = 60.0

def _check_login_rate_limit(request: Request):
    ip = request.client.host if request.client and request.client.host else "unknown"
    now = time.monotonic()
    hist = _LOGIN_ATTEMPTS.get(ip, [])
    hist = [t for t in hist if now - t < LOGIN_WINDOW_S]
    if len(hist) >= LOGIN_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiados intentos de login, espera 1 minuto (B0-7)")
    hist.append(now)
    _LOGIN_ATTEMPTS[ip] = hist

@router.post("/register", response_model=RegisterOut, summary="Registro arrendador")
async def register(data: RegisterIn, db: AsyncSession = Depends(get_session)):
    # B0-1: intenta DB real; fallback mock solo dev.
    try:
        from ..models import Usuario
        existing = await db.execute(select(Usuario).where(Usuario.email == data.email))
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Email ya registrado")
        nuevo = Usuario(
            nombre_completo=data.nombre_completo,
            email=data.email,
            password_hash=hash_password(data.password),
            telefono_whatsapp=data.telefono_whatsapp,
            rol="ARRENDADOR",
            telefono_verificado=False,
        )
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return {"id": nuevo.id, "email": nuevo.email, "rol": nuevo.rol, "mock": False}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth register] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        if data.email in MOCK_USERS:
            raise HTTPException(status_code=400, detail="Email ya registrado (mock)")
        return {"id": 99, "email": data.email, "rol": "ARRENDADOR", "mock": True}

@router.post("/login", response_model=LoginOut, summary="Login JWT HS256 2h (T2)")
async def login(data: LoginIn, request: Request, db: AsyncSession = Depends(get_session)):
    _check_login_rate_limit(request)
    # B0-1: intenta DB real primero; fallback mock solo dev.
    try:
        from ..models import Usuario
        res = await db.execute(select(Usuario).where(Usuario.email == data.email))
        u_db = res.scalars().first()
        if u_db is not None:
            if not verify_password(data.password, u_db.password_hash):
                raise HTTPException(status_code=401, detail="Credenciales inválidas")
            token = create_token({
                "sub": u_db.email, "rol": u_db.rol, "id": u_db.id,
                "telefono_verificado": bool(u_db.telefono_verificado),
            })
            return {"access_token": token, "token_type": "bearer", "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": u_db.rol, "mock": False}
        # No en DB: en prod 401 directo (no filtrar existencia, no mock).
        if not _mock_enabled():
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        # Fallback mock dev:
        u = MOCK_USERS.get(data.email)
        if not u or not verify_password(data.password, u["password"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        token = create_token({"sub": data.email, "rol": u["rol"], "id": u["id"], "telefono_verificado": True})
        return {"access_token": token, "token_type": "bearer", "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": u["rol"], "mock": True}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth login] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        u = MOCK_USERS.get(data.email)
        if not u or not verify_password(data.password, u["password"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        token = create_token({"sub": data.email, "rol": u["rol"], "id": u["id"], "telefono_verificado": True})
        return {"access_token": token, "token_type": "bearer", "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": u["rol"], "mock": True}

@router.get("/perfil", response_model=PerfilOut, summary="Obtener perfil del usuario autenticado")
async def get_perfil(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    email = user.get("sub")
    user_id = user.get("id")
    try:
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
        if u:
            return PerfilOut(
                id=u.id,
                email=u.email,
                nombre_completo=u.nombre_completo,
                telefono_whatsapp=u.telefono_whatsapp,
                telefono_verificado=bool(u.telefono_verificado),
                rol=u.rol,
            )
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[auth get_perfil] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Fallback mock dev
    m = MOCK_USERS.get(email)
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        return PerfilOut(
            id=user_id or 1,
            email=email or "arrendador@alojau.com",
            nombre_completo="Arrendador Demo",
            telefono_whatsapp="573001234567",
            telefono_verificado=bool(user.get("telefono_verificado", False)),
            rol=user.get("rol", "ARRENDADOR"),
        )
    return PerfilOut(
        id=m.get("id", user_id or 1),
        email=email,
        nombre_completo=m.get("nombre_completo", "Arrendador Demo"),
        telefono_whatsapp=m.get("telefono_whatsapp", "573001234567"),
        telefono_verificado=bool(m.get("telefono_verificado", False)),
        rol=m.get("rol", "ARRENDADOR"),
    )

@router.patch("/perfil/password", summary="Cambiar contraseña (requiere la actual)")
async def cambiar_password(
    data: PasswordChangeIn,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Tarea 2: actualiza la contraseña tras verificar la actual + fortaleza.

    Fortaleza: >=8 chars con letras y números. 401 sin token, 403 si la
    actual no coincide, 422 si la nueva es débil o igual a la actual.
    """
    import re

    def _debil(pw: str) -> Optional[str]:
        if len(pw) < 8:
            return "La nueva contraseña debe tener al menos 8 caracteres"
        if not re.search(r"[A-Za-z]", pw) or not re.search(r"[0-9]", pw):
            return "La nueva contraseña debe incluir letras y números"
        return None

    email = user.get("sub")
    user_id = user.get("id")
    _check_password_rate_limit(f"{user_id or email}")
    err = _debil(data.nueva)
    if err:
        raise HTTPException(status_code=422, detail=err)
    if data.nueva == data.actual:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser distinta de la actual")
    try:
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
        if u:
            if not verify_password(data.actual, u.password_hash):
                raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
            u.password_hash = hash_password(data.nueva)
            await db.commit()
            return {"mensaje": "Contraseña actualizada con éxito."}
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth password] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Fallback mock dev
    m = MOCK_USERS.get(email)
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not verify_password(data.actual, m["password"]):
        raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
    m["password"] = hash_password(data.nueva)
    return {"mensaje": "Contraseña actualizada con éxito."}


@router.post("/perfil/solicitud-verificacion", status_code=202, summary="Solicitar verificación de teléfono")
async def solicitar_verificacion(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Tarea 2: registra la intención (la verificación la otorga un ADMIN).

    Sin tabla dedicada: responde 202 para que la UI confirme el envío.
    """
    return {"mensaje": "Solicitud registrada. Un administrador verificará tu línea.", "estado": "PENDIENTE"}


@router.patch("/perfil", response_model=PerfilOut, summary="Actualizar nombre y teléfono (verificación solo-lectura)")
async def update_perfil(
    data: PerfilUpdateIn,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    email = user.get("sub")
    user_id = user.get("id")
    try:
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
        if u:
            if data.nombre_completo is not None:
                u.nombre_completo = data.nombre_completo
            if data.telefono_whatsapp is not None:
                u.telefono_whatsapp = data.telefono_whatsapp
            # OLA2-M4: sin escritura de telefono_verificado (solo-lectura).
            await db.commit()
            await db.refresh(u)
            return PerfilOut(
                id=u.id,
                email=u.email,
                nombre_completo=u.nombre_completo,
                telefono_whatsapp=u.telefono_whatsapp,
                telefono_verificado=bool(u.telefono_verificado),
                rol=u.rol,
            )
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth update_perfil] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Fallback mock dev
    m = MOCK_USERS.get(email)
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        m = {
            "password": hash_password("AlojaU123"),
            "rol": user.get("rol", "ARRENDADOR"),
            "id": user_id or 1,
            "nombre_completo": "Arrendador Demo",
            "telefono_whatsapp": "573001234567",
            "telefono_verificado": False,
        }
        MOCK_USERS[email or "arrendador@alojau.com"] = m

    if data.nombre_completo is not None:
        m["nombre_completo"] = data.nombre_completo
    if data.telefono_whatsapp is not None:
        m["telefono_whatsapp"] = data.telefono_whatsapp
    # OLA2-M4: sin escritura de telefono_verificado (solo-lectura).

    # Sincronizar con publicaciones mock del usuario para que el contacto refleje el teléfono
    try:
        from .publicaciones import MOCK_PUBS
        for pub in MOCK_PUBS:
            if pub.get("usuario_id") == m.get("id"):
                if data.telefono_whatsapp is not None:
                    pub["telefono_whatsapp"] = data.telefono_whatsapp
    except Exception:
        pass

    return PerfilOut(
        id=m.get("id", user_id or 1),
        email=email or "arrendador@alojau.com",
        nombre_completo=m.get("nombre_completo", "Arrendador Demo"),
        telefono_whatsapp=m.get("telefono_whatsapp", "573001234567"),
        telefono_verificado=bool(m.get("telefono_verificado", False)),
        rol=m.get("rol", "ARRENDADOR"),
    )

