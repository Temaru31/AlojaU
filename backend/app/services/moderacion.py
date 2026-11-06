"""Regla de pausa automática: un aviso ACTIVO con demasiados reportes abiertos
pasa a PAUSADO_POR_REPORTE y queda auditado."""
from dataclasses import asdict, dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dominio import EstadoPublicacion, EstadoReporte
from app.core.errores import NoEncontrado
from app.models import Publicacion, PublicacionesAudit, ReportePublicacion
from app.repositories import ajustes_repo

REPORTES_ABIERTOS = (EstadoReporte.PENDIENTE, EstadoReporte.CONFIRMADO)


@dataclass
class EvaluacionPausa:
    id: int
    reportes: int
    umbral: int
    pausado: bool
    evaluado: bool = True

    def como_dict(self) -> dict:
        return asdict(self)


async def contar_reportes_abiertos(db: AsyncSession, pub_id: int) -> int:
    consulta = select(func.count()).select_from(ReportePublicacion).where(
        ReportePublicacion.publicacion_id == pub_id,
        ReportePublicacion.estado.in_(REPORTES_ABIERTOS),
    )
    return int((await db.execute(consulta)).scalar() or 0)


async def evaluar_pausa_por_reportes(
    db: AsyncSession, pub_id: int, admin_id: int | None
) -> EvaluacionPausa:
    """Pausa el aviso si sus reportes abiertos alcanzan el umbral (sin commit).

    Idempotente: un aviso que no está ACTIVO no cambia.
    """
    umbral = await ajustes_repo.leer_entero(db, "max_reportes_para_pausa_automatica")
    aviso = await db.get(Publicacion, pub_id)
    if aviso is None:
        raise NoEncontrado("Publicación no encontrada")
    reportes = await contar_reportes_abiertos(db, pub_id)
    pausar = reportes >= umbral and aviso.estado == EstadoPublicacion.ACTIVO
    if pausar:
        aviso.estado = EstadoPublicacion.PAUSADO_POR_REPORTE
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=admin_id,
            evento="PAUSED",
            detalle=f"Pausa automática: {reportes} reportes >= umbral {umbral}",
        ))
    return EvaluacionPausa(id=pub_id, reportes=reportes, umbral=umbral, pausado=pausar)
