"""Conteos del panel admin (inventario, reportes, usuarios). Sin HTTP."""
from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dominio import EstadoPublicacion, EstadoReporte, Rol
from app.db.session import get_session
from app.repositories.publicacion_repo import dueno_activo_clause


class MetricasRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _contar(self, stmt) -> int:
        return int((await self.db.execute(stmt)).scalar() or 0)

    async def avisos(self, estado: EstadoPublicacion | None = None) -> int:
        """Avisos de dueños activos (las cuentas en soft-delete no cuentan)."""
        from app.models import Publicacion
        conds = [dueno_activo_clause(Publicacion)]
        if estado is not None:
            conds.append(Publicacion.estado == estado)
        return await self._contar(select(func.count()).select_from(Publicacion).where(*conds))

    async def reportes(self, *estados: EstadoReporte) -> int:
        from app.models import ReportePublicacion
        return await self._contar(select(func.count()).select_from(ReportePublicacion)
                                  .where(ReportePublicacion.estado.in_(estados)))

    async def inmuebles_con_reportes_pendientes(self) -> int:
        """Avisos distintos con algún reporte PENDIENTE (usa idx_reportes_pub_estado)."""
        from app.models import ReportePublicacion
        return await self._contar(select(func.count(func.distinct(ReportePublicacion.publicacion_id)))
                                  .where(ReportePublicacion.estado == EstadoReporte.PENDIENTE))

    async def usuarios(self, *, solo_arrendadores_verificados: bool = False) -> int:
        from app.models import Usuario
        conds = [Usuario.eliminado_en.is_(None)]
        if solo_arrendadores_verificados:
            conds += [Usuario.rol == Rol.ARRENDADOR, Usuario.telefono_verificado.is_(True)]
        return await self._contar(select(func.count()).select_from(Usuario).where(*conds))

    async def avisos_pendientes_de_moderar(self) -> int:
        """Cola de moderación: incluye dueños en soft-delete (el admin debe verlos para purgar)."""
        from app.models import Publicacion
        return await self._contar(select(func.count()).select_from(Publicacion)
                                  .where(Publicacion.estado == EstadoPublicacion.PENDIENTE))


def get_metricas_repo(db: AsyncSession = Depends(get_session)) -> MetricasRepo:
    return MetricasRepo(db)
