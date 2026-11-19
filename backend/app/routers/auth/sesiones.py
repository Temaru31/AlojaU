"""Emisión del JWT con sesión revocable, revocación y respuesta de login."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import client_ip
from app.core.security import create_token

logger = logging.getLogger("alojau.auth")


def _emitir_token(usuario_id: int, email: str, rol: str,
                  telefono_verificado: bool = False,
                  email_verificado: bool = False,
                  jti: str | None = None) -> str:
    from app.core.permissions import scopes_for_role
    claims = {
        "sub": email,
        "rol": rol,
        "id": usuario_id,
        "telefono_verificado": bool(telefono_verificado),
        "email_verificado": bool(email_verificado),
        "scopes": sorted(scopes_for_role(rol)),
    }
    if jti:
        claims["jti"] = jti
    return create_token(claims)


async def _registrar_sesion(db: AsyncSession, usuario_id: int, jti: str,
                            request: Request | None) -> None:
    """Guarda la sesión para revocación global.

    Best-effort: si falla, el login continúa (el token sigue siendo válido por
    firma y expiración) pero queda registrado que no podrá revocarse por jti.
    """
    from app.models import Sesion
    user_agent = (request.headers.get("user-agent", "")[:255] or None) if request else None
    try:
        db.add(Sesion(
            usuario_id=usuario_id, jti=jti,
            ip=client_ip(request), user_agent=user_agent,
        ))
        await db.commit()
    except Exception as e:
        logger.warning("[sesiones] no se pudo registrar la sesión uid=%s: %s",
                       usuario_id, exc_resumen(e))
        await rollback_seguro(db, "_registrar_sesion")


async def emitir_token_con_sesion(db: AsyncSession, usuario, request: Request,
                                  email_verificado: bool) -> str:
    """Emite el JWT de un usuario persistido y registra su sesión revocable."""
    jti = uuid.uuid4().hex
    token = _emitir_token(usuario.id, usuario.email, usuario.rol,
                          bool(usuario.telefono_verificado), email_verificado, jti=jti)
    await _registrar_sesion(db, usuario.id, jti, request)
    return token


async def revocar_sesiones_usuario(db: AsyncSession, usuario_id: int,
                                   jti: str | None = None) -> int:
    """Revoca sesiones activas del usuario (todas, o solo el jti dado).

    Fuente única para /logout, /logout-all y /sesiones/revocar-todas.
    No hace commit (lo hace el endpoint dueño de la transacción).
    """
    from app.models import Sesion
    conds = [Sesion.usuario_id == usuario_id, Sesion.revocado.is_(False)]
    if jti:
        conds.append(Sesion.jti == jti)
    res = await db.execute(select(Sesion).where(*conds))
    n = 0
    for s in res.scalars().all():
        s.revocado = True
        s.revocado_en = datetime.now(timezone.utc)
        n += 1
    return n


def respuesta_login(token: str, rol: str) -> dict:
    return {"access_token": token, "token_type": "bearer",
            "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": rol}
