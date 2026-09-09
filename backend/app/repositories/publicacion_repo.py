"""Consultas SQL AlojaU (capa repositorio, sin HTTP ni DTOs).
Uso: routers/publicaciones.py. Ej: total, pubs = await repo.query_lista(db, ...)."""
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.pagination import paginate_params, build_paginated


def lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios):
    """Filtros HU-001/002 compartidos por COUNT y página (SQLAlchemy portable PG/SQLite)."""
    conds = [Publicacion.estado == "ACTIVO"]
    if precio_min is not None:
        conds.append(Publicacion.canon_mensual >= precio_min)
    if precio_max is not None:
        conds.append(Publicacion.canon_mensual <= precio_max)
    if tipo:
        conds.append(Publicacion.tipo_inmueble == tipo)
    if servicios:
        for sid in servicios:
            conds.append(Publicacion.servicios.any(id=sid))
    return conds


async def count_total(db: AsyncSession, conds, campus_id: Optional[int]) -> int:
    """COUNT DISTINCT en SQL (sin traer filas)."""
    from app.models import Publicacion, PublicacionCampus

    stmt = select(func.count(func.distinct(Publicacion.id))).where(*conds)
    if campus_id:
        stmt = stmt.join(
            PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id
        ).where(PublicacionCampus.campus_id == campus_id)
    return (await db.execute(stmt)).scalar() or 0


async def fetch_page(db: AsyncSession, conds, campus_id: Optional[int], limit: int, offset: int):
    """Página en SQL con orden determinista (distancia NULLS LAST + id)."""
    from app.models import Publicacion, PublicacionCampus

    stmt = (
        select(Publicacion)
        .options(selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios))
        .where(*conds)
    )
    if campus_id:
        stmt = (
            stmt.join(PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id)
            .where(PublicacionCampus.campus_id == campus_id)
            .order_by(PublicacionCampus.distancia_geodesica_m.asc().nullslast(), Publicacion.id.asc())
        )
    else:
        stmt = stmt.order_by(Publicacion.id.asc())
    stmt = stmt.limit(limit).offset(offset)
    return (await db.execute(stmt)).scalars().unique().all()


async def fetch_page_aggregates(db: AsyncSession, pubs, campus_id: Optional[int]):
    """3 queries fijas para la página (reportes, usuarios, distancias). Sin N+1."""
    from app.models import PublicacionCampus, ReportePublicacion, Usuario

    page_ids = [p.id for p in pubs]
    rep_rows = (
        await db.execute(
            select(ReportePublicacion.publicacion_id, func.count())
            .where(
                ReportePublicacion.publicacion_id.in_(page_ids),
                ReportePublicacion.estado.in_(["PENDIENTE", "CONFIRMADO"]),
            )
            .group_by(ReportePublicacion.publicacion_id)
        )
    ).all()
    reportes_map = {pub_id: n for pub_id, n in rep_rows}

    user_ids = {p.usuario_id for p in pubs}
    users = (
        (await db.execute(select(Usuario).where(Usuario.id.in_(user_ids)))).scalars().all()
        if user_ids
        else []
    )
    users_map = {u.id: u for u in users}

    dist_map = {}
    if campus_id:
        dist_rows = (
            await db.execute(
                select(PublicacionCampus).where(
                    PublicacionCampus.publicacion_id.in_(page_ids),
                    PublicacionCampus.campus_id == campus_id,
                )
            )
        ).scalars().all()
        dist_map = {pc.publicacion_id: pc.distancia_geodesica_m for pc in dist_rows}
    return reportes_map, users_map, dist_map


async def query_lista(db, campus_id, precio_min, precio_max, tipo, servicios, page=1, size=9):
    """COUNT + página + agregados para GET /api/publicaciones.
    Uso: routers/publicaciones.py::list_publicaciones. Ej: total, pubs, *_map, size = await query_lista(db, 1, None, None, None, None)."""
    from app.models import Publicacion

    conds = lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios)
    offset, size_norm = paginate_params(page, size)
    total = await count_total(db, conds, campus_id)
    if total == 0:
        return build_paginated([], 0, page, size_norm)
    pubs = await fetch_page(db, conds, campus_id, size_norm, offset)
    reportes_map, users_map, dist_map = await fetch_page_aggregates(db, pubs, campus_id)
    return total, pubs, reportes_map, users_map, dist_map, size_norm


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
            ReportePublicacion.estado.in_(["PENDIENTE", "CONFIRMADO"]),
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


async def validate_fks(db: AsyncSession, zona_id: int, campus_ids: List[int], servicios_ids: List[int]):
    """FK estrictas + dedup (404 si zona/campus inactivo/servicio falta).
    Uso: routers/publicaciones.py::crear_publicacion. Ej: cids, sids = await validate_fks(db, 1, [1, 1], [1])."""
    from fastapi import HTTPException

    from app.models import CampusUniversitario, ServicioCatalogo, ZonaBarrio

    campus_ids = list(dict.fromkeys(campus_ids))
    servicios_ids = list(dict.fromkeys(servicios_ids))
    if not await db.get(ZonaBarrio, zona_id):
        raise HTTPException(status_code=404, detail=f"zona_barrio_id {zona_id} no existe")
    for cid in campus_ids:
        campus = await db.get(CampusUniversitario, cid)
        if not campus or not campus.activo:
            raise HTTPException(status_code=404, detail=f"campus_id {cid} no existe o inactivo")
    for sid in servicios_ids:
        if not await db.get(ServicioCatalogo, sid):
            raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
    return campus_ids, servicios_ids


async def create_persisted(db, payload, user_id: int, trust: dict, campus_ids, servicios_ids):
    """Persiste PENDIENTE + links N:M + fotos + audit (requiere FK validadas).
    Uso: routers/publicaciones.py::crear_publicacion. Ej: nueva = await create_persisted(db, payload, 1, trust, [1], [1])."""
    from datetime import datetime, timezone, timedelta

    from app.models import (
        ImagenPublicacion,
        Publicacion,
        PublicacionCampus,
        PublicacionServicio,
        PublicacionesAudit as PublicacionAudit,
    )
    from app.services.haversine import haversine_m
    from app.models import CampusUniversitario

    nueva = Publicacion(
        usuario_id=user_id,
        zona_barrio_id=payload.zona_barrio_id,
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        tipo_inmueble=payload.tipo_inmueble,
        canon_mensual=payload.canon_mensual,
        deposito_requerido=payload.deposito_requerido,
        reglas_convivencia=payload.reglas_convivencia,
        direccion_referencial=payload.direccion_referencial,
        latitud=payload.latitud,
        longitud=payload.longitud,
        estado="PENDIENTE",
        indice_confianza=trust["indice"],
        fecha_expiracion=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(nueva)
    await db.flush()
    for cid in campus_ids:
        dist = None
        if payload.latitud is not None and payload.longitud is not None:
            campus = await db.get(CampusUniversitario, cid)
            if campus is not None and campus.latitud is not None and campus.longitud is not None:
                dist = haversine_m(
                    float(payload.latitud), float(payload.longitud),
                    float(campus.latitud), float(campus.longitud),
                )
        db.add(PublicacionCampus(publicacion_id=nueva.id, campus_id=cid, distancia_geodesica_m=dist))
    for sid in servicios_ids:
        db.add(PublicacionServicio(publicacion_id=nueva.id, servicio_id=sid))
    for idx, url in enumerate(payload.fotos, start=1):
        db.add(ImagenPublicacion(publicacion_id=nueva.id, url=str(url), orden=idx))
    db.add(PublicacionAudit(publicacion_id=nueva.id, usuario_id=nueva.usuario_id, evento="CREATED", detalle="PENDIENTE"))
    await db.commit()
    await db.refresh(nueva)
    return nueva
