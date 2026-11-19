"""Detalle de un aviso con sus agregados y la distancia al lugar de referencia."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.dominio import EstadoReporte
from app.core.errores import NoEncontrado


async def fetch_detail_bundle(db: AsyncSession, pub_id: int):
    """Publicación + reportes + dueño + distancia mínima (1+3 queries fijas).
    Uso: routers/publicaciones.py::get_publicacion. Ej: p, n, u, d = await fetch_detail_bundle(db, 1)."""
    from app.models import Publicacion, PublicacionCampus, ReportePublicacion, Usuario

    p = await db.get(
        Publicacion, pub_id,
        options=[selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios)],
    )
    if not p:
        return None, 0, None, None
    r = await db.execute(
        select(func.count())
        .select_from(ReportePublicacion)
        .where(
            ReportePublicacion.publicacion_id == p.id,
            ReportePublicacion.estado.in_([EstadoReporte.PENDIENTE, EstadoReporte.CONFIRMADO]),
        )
    )
    u = await db.get(Usuario, p.usuario_id)
    pc_min = await db.execute(
        select(PublicacionCampus)
        .where(PublicacionCampus.publicacion_id == p.id)
        .order_by(PublicacionCampus.distancia_geodesica_m)
    )
    pc_min = pc_min.scalars().first()
    return p, (r.scalar() or 0), u, (pc_min.distancia_geodesica_m if pc_min else None)


async def fetch_detail_campus_ref(db: AsyncSession, pub_id: int, campus_id: int):
    """Fila publicacion_campus + lugar para GET detalle ?campus_id= (004 POIs).

    Retorna (dist_m, campus) o (None, None) si el aviso no tiene coords
    (edge case: la fila existe con dist NULL por trigger sin coords). Lanza
    NoEncontrado si el lugar no existe o está inactivo. Uso: routers/publicaciones.py.
    """
    from app.models import CampusUniversitario, PublicacionCampus

    campus = await db.get(CampusUniversitario, campus_id)
    if not campus or not campus.activo:
        raise NoEncontrado(f"campus_id {campus_id} no existe o inactivo")
    row = await db.get(PublicacionCampus, (pub_id, campus_id))
    dist = row.distancia_geodesica_m if row else None
    return dist, campus


async def fotos_de_aviso(db, pub_id: int) -> list:
    """Fotos del aviso ordenadas por `orden` (1 = portada)."""
    from sqlalchemy import select

    from app.models import ImagenPublicacion

    return (await db.execute(
        select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
        .order_by(ImagenPublicacion.orden.asc())
    )).scalars().all()
