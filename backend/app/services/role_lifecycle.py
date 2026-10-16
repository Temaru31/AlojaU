"""v13.2 ciclo de vida dinámico de roles (RBAC reactivo).

Reglas (ver análisis V13.2):
- Promoción 0->1: ESTUDIANTE que publica -> ARRENDADOR (ya existía el flujo;
  aquí vive la primitiva transaccional reutilizable).
- Democión N->0: SOLO por borrado explícito (DELETE dueño/admin) o pase a
  estado terminal vía moderación. NUNCA por expiración pasiva, NUNCA a
  ADMIN/MODERADOR_CAMPUS/AUDITOR_LEGAL, NUNCA a cuentas en soft-delete.
- Concurrencia: el conteo + cambio de rol se hacen con la fila del dueño
  bloqueada (SELECT ... FOR UPDATE) dentro de la transacción del endpoint,
  de modo que dos DELETE concurrentes no pueden contar dos veces "1".
- Vigentes (democión): PENDIENTE, ACTIVO, PAUSADO, PAUSADO_POR_REPORTE,
  REVISION_REQUERIDA. Terminales: RECHAZADO, ARRENDADO, EXPIRADO, DESACTIVADO.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

ESTADOS_VIGENTES = frozenset({
    "PENDIENTE", "ACTIVO", "PAUSADO", "PAUSADO_POR_REPORTE", "REVISION_REQUERIDA",
})

# Roles que la democión puede degradar. Fuera de aquí: intocables.
ROLES_DEMOTABLES = frozenset({"ARRENDADOR"})


async def contar_vigentes(db: AsyncSession, usuario_id: int) -> int:
    """Nº de publicaciones del dueño en estados vigentes (excluye terminales)."""
    from app.models import Publicacion

    stmt = select(func.count()).select_from(Publicacion).where(
        Publicacion.usuario_id == usuario_id,
        Publicacion.estado.in_(ESTADOS_VIGENTES),
    )
    return (await db.execute(stmt)).scalar() or 0


async def bloquear_dueno(db: AsyncSession, usuario_id: int):
    """Lee la fila del dueño con row-lock (serializa DELETEs concurrentes)."""
    from app.models import Usuario

    res = await db.execute(
        select(Usuario).where(Usuario.id == usuario_id).with_for_update())
    return res.scalars().first()


async def promover_si_estudiante(db: AsyncSession, usuario_id: int) -> str | None:
    """Promueve a ARRENDADOR si era ESTUDIANTE (con lock). Retorna rol final."""
    u = await bloquear_dueno(db, usuario_id)
    if u is None:
        return None
    if getattr(u, "eliminado_en", None) is not None:
        return u.rol
    if u.rol == "ESTUDIANTE":
        u.rol = "ARRENDADOR"
        await db.flush()
    return u.rol


async def evaluar_democion(db: AsyncSession, usuario_id: int) -> tuple[str | None, bool]:
    """Demociona ARRENDADOR->ESTUDIANTE si quedó en 0 vigentes (con lock).

    Retorna (rol_final, democionado). No toca roles fuera de ROLES_DEMOTABLES
    ni cuentas en soft-delete. Llamar ANTES del commit del endpoint para que
    conteo + cambio queden en la misma transacción.
    """
    u = await bloquear_dueno(db, usuario_id)
    if u is None:
        return None, False
    if getattr(u, "eliminado_en", None) is not None:
        return u.rol, False
    if u.rol not in ROLES_DEMOTABLES:
        return u.rol, False
    if await contar_vigentes(db, usuario_id) == 0:
        u.rol = "ESTUDIANTE"
        await db.flush()
        return u.rol, True
    return u.rol, False
