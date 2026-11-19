"""Consultas de publicidad: planes y avisos destacados. Sin HTTP ni commit."""
from datetime import datetime

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dominio import EstadoDestacado
from app.db.session import get_session


class DestacadosRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def planes_activos(self):
        """Planes activos ordenados por días (7/15/30)."""
        from app.models import PlanPublicidad
        return (await self.db.execute(
            select(PlanPublicidad)
            .where(PlanPublicidad.activo.is_(True))
            .order_by(PlanPublicidad.dias.asc())
        )).scalars().all()

    async def tiene_vigente(self, pub_id: int, ahora: datetime) -> bool:
        """True si el aviso ya tiene un destacado PENDIENTE o ACTIVO sin vencer."""
        from app.models import PublicacionDestacado
        vigentes = (await self.db.execute(
            select(func.count()).select_from(PublicacionDestacado).where(
                PublicacionDestacado.publicacion_id == pub_id,
                PublicacionDestacado.estado.in_([EstadoDestacado.PENDIENTE, EstadoDestacado.ACTIVO]),
                PublicacionDestacado.vence > ahora,
            )
        )).scalar() or 0
        return bool(vigentes)

    async def _con_nombre_de_plan(self, *conds, recientes_primero: bool):
        from app.models import PlanPublicidad, PublicacionDestacado
        orden = PublicacionDestacado.id.desc() if recientes_primero else PublicacionDestacado.id.asc()
        return (await self.db.execute(
            select(PublicacionDestacado, PlanPublicidad.nombre)
            .join(PlanPublicidad, PlanPublicidad.id == PublicacionDestacado.plan_id)
            .where(*conds)
            .order_by(orden)
        )).all()

    async def del_dueno(self, uid: int):
        """[(destacado, nombre_plan)] creados por el dueño, recientes primero."""
        from app.models import PublicacionDestacado
        return await self._con_nombre_de_plan(PublicacionDestacado.created_by == uid, recientes_primero=True)

    async def pendientes(self):
        """[(destacado, nombre_plan)] por aprobar, más antiguos primero."""
        from app.models import PublicacionDestacado
        return await self._con_nombre_de_plan(PublicacionDestacado.estado == EstadoDestacado.PENDIENTE,
                                              recientes_primero=False)


def get_destacados_repo(db: AsyncSession = Depends(get_session)) -> DestacadosRepo:
    return DestacadosRepo(db)
