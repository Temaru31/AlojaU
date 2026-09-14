"""Resource Server: /perfil (GET/PATCH) guiado por el access token Keycloak.

Este módulo NO maneja login ni registro (eso ocurre en Keycloak/frontend): solo
valida el Bearer token (get_current_user -> JWKS) y sirve el perfil del usuario
autenticado. Únicos roles: "landlord" y "admin".
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import get_current_user
from ..core.config import settings
from ..db.session import get_session

logger = logging.getLogger("alojau.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Perfiles demo para dev sin BD (la autenticación es Keycloak: sin contraseñas aquí).
MOCK_USERS = {
    "arrendador@alojau.com": {
        "rol": "LANDLORD",
        "id": 1,
        "nombre_completo": "Arrendador Demo",
        "telefono_whatsapp": "573001234567",
        "telefono_verificado": False,
    },
    "admin@alojau.com": {
        "rol": "ADMIN",
        "id": 2,
        "nombre_completo": "Administrador AlojaU",
        "telefono_whatsapp": "573009998877",
        "telefono_verificado": True,
    },
}


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


def _keycloak_configured() -> bool:
    return settings.keycloak_configured


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
        if not _mock_enabled() and not _keycloak_configured():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[auth get_perfil] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Keycloak: perfil autoridad = el access token (usuario puede no existir aún en BD local).
    if _keycloak_configured():
        return PerfilOut(
            id=user_id or 0,
            email=email or user.get("sub"),
            nombre_completo=user.get("nombre_completo") or "Usuario",
            telefono_whatsapp=user.get("telefono_whatsapp"),
            telefono_verificado=bool(user.get("telefono_verificado", False)),
            rol=user.get("rol", "LANDLORD"),
        )

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
            rol=user.get("rol", "LANDLORD"),
        )
    return PerfilOut(
        id=m.get("id", user_id or 1),
        email=email,
        nombre_completo=m.get("nombre_completo", "Arrendador Demo"),
        telefono_whatsapp=m.get("telefono_whatsapp", "573001234567"),
        telefono_verificado=bool(m.get("telefono_verificado", False)),
        rol=m.get("rol", "LANDLORD"),
    )


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
        if not _mock_enabled() and not _keycloak_configured():
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

    # Keycloak: sin BD la actualización es in-memory (no persistente).
    if _keycloak_configured():
        m = {
            "rol": user.get("rol", "LANDLORD"),
            "id": user_id or 0,
            "nombre_completo": user.get("nombre_completo", "Usuario"),
            "telefono_whatsapp": user.get("telefono_whatsapp", "573001234567"),
            "telefono_verificado": False,
        }
        if data.nombre_completo is not None:
            m["nombre_completo"] = data.nombre_completo
        if data.telefono_whatsapp is not None:
            m["telefono_whatsapp"] = data.telefono_whatsapp
        return PerfilOut(
            id=m["id"],
            email=email or user.get("sub"),
            nombre_completo=m["nombre_completo"],
            telefono_whatsapp=m["telefono_whatsapp"],
            telefono_verificado=bool(user.get("telefono_verificado", False)),
            rol=m["rol"],
        )

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
            "rol": user.get("rol", "LANDLORD"),
            "id": user_id or 1,
            "nombre_completo": user.get("nombre_completo", "Arrendador Demo"),
            "telefono_whatsapp": user.get("telefono_whatsapp", "573001234567"),
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
        rol=m.get("rol", "LANDLORD"),
    )