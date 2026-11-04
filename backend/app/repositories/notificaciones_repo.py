"""Consultas de la bandeja in-app y de las búsquedas guardadas (alertas). Sin HTTP.

Los métodos no hacen commit: la transacción la cierra el endpoint.
"""
from datetime import datetime, timezone

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session


class NotificacionesRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _contar(self, stmt) -> int:
        return int((await self.db.execute(stmt)).scalar() or 0)

    async def pagina(self, uid: int, offset: int, size: int, solo_no_leidas: bool = False):
        """(total, filas) de la bandeja del usuario, recientes primero."""
        from app.models import Notificacion
        conds = [Notificacion.usuario_id == uid]
        if solo_no_leidas:
            conds.append(Notificacion.leida.is_(False))
        total = await self._contar(select(func.count()).select_from(Notificacion).where(*conds))
        filas = (await self.db.execute(
            select(Notificacion).where(*conds)
            .order_by(Notificacion.created_at.desc()).offset(offset).limit(size)
        )).scalars().all()
        return total, filas

    async def no_leidas(self, uid: int) -> int:
        from app.models import Notificacion
        return await self._contar(select(func.count()).select_from(Notificacion).where(
            Notificacion.usuario_id == uid, Notificacion.leida.is_(False)))

    async def marcar_todas_leidas(self, uid: int) -> int:
        """Un UPDATE por usuario; devuelve cuántas cambiaron."""
        from app.models import Notificacion
        res = await self.db.execute(
            Notificacion.__table__.update().where(
                Notificacion.usuario_id == uid,
                Notificacion.leida.is_(False),
            ).values(leida=True, leida_en=datetime.now(timezone.utc))
        )
        return res.rowcount or 0

    async def notificacion(self, nid: int):
        from app.models import Notificacion
        return await self.db.get(Notificacion, nid)

    async def alertas_activas(self, uid: int) -> int:
        from app.models import BusquedaGuardada
        return await self._contar(select(func.count()).select_from(BusquedaGuardada).where(
            BusquedaGuardada.usuario_id == uid, BusquedaGuardada.activa.is_(True)))

    async def alertas(self, uid: int):
        """Todas las alertas del usuario (activas e inactivas), recientes primero."""
        from app.models import BusquedaGuardada
        return (await self.db.execute(
            select(BusquedaGuardada).where(BusquedaGuardada.usuario_id == uid)
            .order_by(BusquedaGuardada.id.desc())
        )).scalars().all()

    async def alerta(self, bid: int):
        from app.models import BusquedaGuardada
        return await self.db.get(BusquedaGuardada, bid)

    async def existe_campus(self, campus_id: int) -> bool:
        from app.models import CampusUniversitario
        return await self.db.get(CampusUniversitario, campus_id) is not None

    async def existe_zona(self, zona_id: int) -> bool:
        from app.models import ZonaBarrio
        return await self.db.get(ZonaBarrio, zona_id) is not None


def get_notificaciones_repo(db: AsyncSession = Depends(get_session)) -> NotificacionesRepo:
    return NotificacionesRepo(db)
