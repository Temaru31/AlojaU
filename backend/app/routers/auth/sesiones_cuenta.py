"""Promoción de rol, sesiones revocables, logout y borrado/restauración de cuenta."""
import logging
from fastapi import APIRouter
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, Depends, Request, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.db.session import get_session
from app.core.dominio import Rol
from app.core.normalizacion import normalizar_email
from app.core.dominio import DIAS_GRACIA_CUENTA
from app.routers.auth.comun import (
    _emitir_token_con_sesion,
    _gracia_restante,
    _intentar_purgar_usuario,
    _revocar_sesiones_usuario,
    _verify_password_async,
)
from app.routers.auth.esquemas import CuentaEliminarIn, CuentaRestaurarIn, LoginOut, SesionOut

logger = logging.getLogger("alojau.auth")
router = APIRouter()

# ---------------------------------------------------------------------------
# Promoción dinámica ESTUDIANTE -> ARRENDADOR (al publicar)
# ---------------------------------------------------------------------------
async def promover_a_arrendador(db: AsyncSession, usuario_id: int) -> Optional[str]:
    """Promueve a ARRENDADOR si era ESTUDIANTE. Retorna el rol final o None si el usuario no existe.

    v13.2: delega en role_lifecycle (row-lock); NO hace commit (lo hace el
    endpoint dueño de la transacción).
    """
    from app.services import role_lifecycle as _rl
    return await _rl.promover_si_estudiante(db, usuario_id)


@router.post("/promover", summary="Promover mi cuenta a ARRENDADOR (desde ESTUDIANTE)")
async def promoverme(user: ClaimsUsuario = Depends(get_current_user),
                     db: AsyncSession = Depends(get_session)):
    uid = id_propietario(user)
    try:
        rol = await promover_a_arrendador(db, uid)
        if rol is None:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        # El helper no hace commit: lo hace el endpoint, dueño de la transacción.
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        # Un fallo de BD no es "usuario no encontrado": 503 reintentable.
        await rollback_seguro(db, "promoverme")
        logger.error("[auth promover] falló: %s", exc_resumen(e), exc_info=True)
        raise HTTPException(status_code=503, detail="No se pudo actualizar tu rol, intenta de nuevo")
    return {"rol": rol, "mensaje": "Cuenta promovida a ARRENDADOR." if rol == Rol.ARRENDADOR else "Sin cambios."}


# ---------------------------------------------------------------------------
# Sesiones activas + revocación global ("cerrar en todos los dispositivos")
# ---------------------------------------------------------------------------
@router.get("/sesiones", response_model=list[SesionOut], summary="Listar sesiones activas")
async def listar_sesiones(user: ClaimsUsuario = Depends(get_current_user),
                          db: AsyncSession = Depends(get_session)):
    uid = user.get("id")
    actual_jti = user.get("jti")
    try:
        from app.models import Sesion
        res = await db.execute(
            select(Sesion).where(Sesion.usuario_id == uid,
                                 Sesion.revocado.is_(False)).order_by(Sesion.id.desc()))
        out = []
        for s in res.scalars().all():
            out.append(SesionOut(
                jti=s.jti, ip=s.ip,
                creado_en=s.creado_en.isoformat() if s.creado_en else None,
                actual=bool(actual_jti and s.jti == actual_jti),
                user_agent=getattr(s, "user_agent", None),
            ))
        return out
    except Exception:
        await rollback_seguro(db, "listar_sesiones")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/sesiones/revocar-todas", summary="Cerrar sesión en todos los dispositivos")
async def revocar_sesiones(user: ClaimsUsuario = Depends(get_current_user),
                           db: AsyncSession = Depends(get_session)):
    uid = user.get("id")
    try:
        n = await _revocar_sesiones_usuario(db, uid)
        await db.commit()
        return {"mensaje": f"Sesiones revocadas: {n}. Vuelve a iniciar sesión.", "revocadas": n}
    except Exception as e:
        await rollback_seguro(db, "revocar_sesiones")
        logger.error(f"[sesiones revocar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


def _claims_sin_verificar_revocacion(authorization: str | None) -> dict | None:
    """Decodifica el Bearer sin exigir sesión activa (logout idempotente).

    Un token ya revocado debe poder cerrar sesión igual (doble clic, multi
    pestaña). Retorna claims o None si no hay token decodificable.
    """
    if not authorization or not authorization.strip():
        return None
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    from app.core.security import decode_token
    try:
        return decode_token(parts[1].strip())
    except HTTPException:  # decode_token traduce todo token inválido a 401
        return None


@router.post("/logout", summary="Cerrar sesión actual (revoca este token)")
async def logout_actual(
    db: AsyncSession = Depends(get_session),
    authorization: str | None = Header(None),
):
    """M1 efecto fantasma: revoca el jti del token actual en BD.

    Idempotente: sin token, token legacy sin jti o ya revocado responden 200
    igual (el frontend limpia el estado local de todas formas).
    """
    claims = _claims_sin_verificar_revocacion(authorization)
    if not claims:
        return {"mensaje": "Sesión cerrada.", "revocadas": 0}
    jti = claims.get("jti")
    uid = claims.get("id")
    if not jti or not isinstance(uid, int):
        return {"mensaje": "Sesión cerrada.", "revocadas": 0}
    try:
        n = await _revocar_sesiones_usuario(db, uid, jti)
        await db.commit()
        return {"mensaje": "Sesión cerrada.", "revocadas": n}
    except Exception as e:
        await rollback_seguro(db, "logout_actual")
        logger.error(f"[logout] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/logout-all", summary="Cerrar sesión en todos los dispositivos")
async def logout_todas(
    db: AsyncSession = Depends(get_session),
    authorization: str | None = Header(None),
):
    """Alias explícito de revocación global (misma semántica que
    /sesiones/revocar-todas). Idempotente como /logout."""
    claims = _claims_sin_verificar_revocacion(authorization)
    if not claims or not isinstance(claims.get("id"), int):
        return {"mensaje": "Sesiones revocadas.", "revocadas": 0}
    uid = claims["id"]
    try:
        n = await _revocar_sesiones_usuario(db, uid)
        await db.commit()
        return {"mensaje": f"Sesiones revocadas: {n}. Vuelve a iniciar sesión.",
                "revocadas": n}
    except Exception as e:
        await rollback_seguro(db, "logout_todas")
        logger.error(f"[logout-all] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


# ---------------------------------------------------------------------------
# Eliminar cuenta (soft-delete 30 días) + restaurar + purga.
# ---------------------------------------------------------------------------
@router.delete("/cuenta", summary="Eliminar mi cuenta (soft-delete 30 días)")
async def eliminar_cuenta(data: CuentaEliminarIn,
                          user: ClaimsUsuario = Depends(get_current_user),
                          db: AsyncSession = Depends(get_session)):
    """Borrado con doble confirmación y período de gracia recuperable.

    - Cuentas `password`: exige la contraseña actual.
    - Cuentas solo-Google (sin contraseña conocida): basta el email escrito.
    Efecto: eliminado_en=ahora + sesiones revocadas. Purga física a los
    30 días (login/register la ejecutan si la gracia venció + endpoint admin).
    """
    uid = id_propietario(user)
    if normalizar_email(data.confirm_email) != normalizar_email(user.get("sub") or ""):
        raise HTTPException(status_code=422, detail="El correo de confirmación no coincide")
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if not u:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        prov = getattr(u, "auth_provider", "password") or "password"
        if prov == "password":
            if not data.password or not await _verify_password_async(data.password, u.password_hash):
                raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        u.eliminado_en = datetime.now(timezone.utc)
        await _revocar_sesiones_usuario(db, u.id)
        # La auto-eliminación queda auditada (misma transacción).
        from app.models import PublicacionesAudit
        db.add(PublicacionesAudit(
            publicacion_id=None, usuario_id=u.id,
            evento="CUENTA_DELETE",
            detalle=f"Soft-delete por el usuario (gracia {DIAS_GRACIA_CUENTA}d)",
        ))
        await db.commit()
        return {"mensaje": (f"Cuenta marcada para eliminación. Tienes {DIAS_GRACIA_CUENTA} días "
                            "para recuperarla en /api/auth/cuenta/restaurar."),
                "gracia_dias": DIAS_GRACIA_CUENTA}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "eliminar_cuenta")
        logger.error(f"[cuenta eliminar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/cuenta/restaurar", response_model=LoginOut, summary="Restaurar cuenta en gracia")
async def restaurar_cuenta(data: CuentaRestaurarIn, request: Request,
                           db: AsyncSession = Depends(get_session)):
    """Revive una cuenta eliminada dentro de los 30 días (emite sesión nueva)."""
    email = normalizar_email(data.email)
    try:
        from app.models import Usuario
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        u = res.scalars().first()
        if not u:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada")
        restan = _gracia_restante(u)
        if restan is None:
            raise HTTPException(status_code=409, detail="La cuenta está activa, inicia sesión normal")
        if restan < 0:
            await _intentar_purgar_usuario(db, u)
            raise HTTPException(status_code=410, detail="Gracia vencida: la cuenta fue purgada")
        if not await _verify_password_async(data.password, u.password_hash):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        u.eliminado_en = None
        await db.commit()
        token = await _emitir_token_con_sesion(
            db, u, request, bool(getattr(u, "email_verificado", False)))
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": u.rol, "mock": False}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "restaurar_cuenta")
        logger.error(f"[cuenta restaurar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
