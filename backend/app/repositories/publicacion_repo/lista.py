"""Listado paginado de avisos: filtros, conteo, página y agregados (reportes, dueños, distancias)."""
import logging
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.pagination import paginate_params
from app.services.search import clean_query_for_fts, tokenize_query
from app.core.logseguro import exc_resumen
from app.core.dominio import EstadoDestacado, EstadoPublicacion, EstadoReporte
from app.repositories.publicacion_repo.texto import fts_condition, fuzzy_condition, resolver_modo_q, tokens_relevance, ts_rank_order

logger = logging.getLogger("alojau.publicaciones.repo")


def dueno_activo_clause(Publicacion):
    """v14.1 Ley 1581: excluye avisos de cuentas en soft-delete.

    NOT EXISTS correlacionado (sin JOIN: no altera forma de COUNT/página).
    Excepción documentada: cola de moderación admin (pendientes) SÍ los
    muestra — el admin debe ver lo que existe para moderar/purgar.
    """
    from app.models import Usuario as _U
    return ~select(_U.id).where(
        (_U.id == Publicacion.usuario_id) & (_U.eliminado_en.is_not(None))
    ).exists()


def lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios, q: Optional[str] = None, q_mode: Optional[str] = None, ciudad_id: Optional[int] = None):
    """Filtros HU-001/002 + Oleada 2 (q tokenizada) + multiciudad compartidos por COUNT y página."""
    conds = [Publicacion.estado == EstadoPublicacion.ACTIVO, dueno_activo_clause(Publicacion)]
    if precio_min is not None:
        conds.append(Publicacion.canon_mensual >= precio_min)
    if precio_max is not None:
        conds.append(Publicacion.canon_mensual <= precio_max)
    if tipo:
        conds.append(Publicacion.tipo_inmueble == tipo)
    if servicios:
        for sid in servicios:
            conds.append(Publicacion.servicios.any(id=sid))
    if ciudad_id:
        from app.models import ZonaBarrio as _ZB

        conds.append(Publicacion.zona.has(_ZB.ciudad_id == ciudad_id))
    if q and q_mode == "fts":
        tokens = tokenize_query(q)
        if tokens:
            conds.append(fts_condition(Publicacion, clean_query_for_fts(tokens)))
        # Sin tokens significativos (solo stop-words) -> sin filtro de texto.
    elif q and q_mode == "fuzzy":
        fc = fuzzy_condition(Publicacion, q)
        if fc is not None:
            conds.append(fc)
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


async def fetch_page(db: AsyncSession, conds, campus_id: Optional[int], limit: int, offset: int, q: Optional[str] = None, q_mode: Optional[str] = None):
    """Página en SQL con orden determinista (distancia NULLS LAST + id).

    Fase 2: con q tokenizada ordena por nº de tokens que matchean (mayoría
    primero) y luego fecha_renovacion; en modo FTS usa ts_rank sobre la query
    limpia + desempate por relevancia tokenizada.
    """
    from app.models import Publicacion, PublicacionCampus

    stmt = (
        select(Publicacion)
        .options(selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios))
        .where(*conds)
    )
    # Publicidad v1: vigentes primero (prioridad desc, NULLS LAST = el resto
    # conserva el orden actual cuando no hay destacados). El LEFT JOIN no
    # filtra ni duplica filas (1 vigente por pub por unique parcial).
    _dest = destacados_vigentes_subq()
    stmt = stmt.outerjoin(_dest, _dest.c.publicacion_id == Publicacion.id)
    _destacado_primero = _dest.c.prioridad.desc().nulls_last()
    tokens = tokenize_query(q) if q else []
    fts_q = clean_query_for_fts(tokens) if tokens else None
    if campus_id:
        stmt = (
            stmt.join(PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id)
            .where(PublicacionCampus.campus_id == campus_id)
        )
        if q_mode == "fts" and fts_q:
            stmt = stmt.order_by(
                _destacado_primero,
                ts_rank_order(Publicacion, fts_q),
                tokens_relevance(Publicacion, tokens).desc() if tokens else Publicacion.id.asc(),
                Publicacion.fecha_renovacion.desc(),
                Publicacion.id.asc(),
            )
        elif tokens:
            stmt = stmt.order_by(
                _destacado_primero,
                tokens_relevance(Publicacion, tokens).desc(),
                Publicacion.fecha_renovacion.desc(),
                Publicacion.id.asc(),
            )
        else:
            stmt = stmt.order_by(_destacado_primero, PublicacionCampus.distancia_geodesica_m.asc().nullslast(), Publicacion.id.asc())
    elif q_mode == "fts" and fts_q:
        stmt = stmt.order_by(
            _destacado_primero,
            ts_rank_order(Publicacion, fts_q),
            tokens_relevance(Publicacion, tokens).desc() if tokens else Publicacion.id.asc(),
            Publicacion.fecha_renovacion.desc(),
            Publicacion.id.asc(),
        )
    elif tokens:
        stmt = stmt.order_by(
            _destacado_primero,
            tokens_relevance(Publicacion, tokens).desc(),
            Publicacion.fecha_renovacion.desc(),
            Publicacion.id.asc(),
        )
    else:
        stmt = stmt.order_by(_destacado_primero, Publicacion.id.asc())
    stmt = stmt.limit(limit).offset(offset)
    return (await db.execute(stmt)).scalars().unique().all()


def destacados_vigentes_subq():
    """Subquery de destacados vigentes (ACTIVO y vence futuro) + prioridad.

    Uso: fetch_page (LEFT JOIN + orden) y fetch_destacados_map (flags).
    Vigente = estado ACTIVO AND vence > now() (spec publicidad §4).
    """
    from app.models import PlanPublicidad, PublicacionDestacado

    return (
        select(
            PublicacionDestacado.publicacion_id.label("publicacion_id"),
            PlanPublicidad.prioridad.label("prioridad"),
            PublicacionDestacado.vence.label("vence"),
        )
        .join(PlanPublicidad, PlanPublicidad.id == PublicacionDestacado.plan_id)
        .where(
            PublicacionDestacado.estado == EstadoDestacado.ACTIVO,
            PublicacionDestacado.vence > func.now(),
        )
        .subquery()
    )


async def fetch_destacados_map(db: AsyncSession, ids) -> dict:
    """{publicacion_id: {"vence", "prioridad"}} vigentes para los ids dados.

    1 query fija (JOIN a planes por prioridad). Vacío si no hay vigentes.
    Uso: routers/publicaciones.py lista/detalle para el flag destacado.
    """
    ids = list({i for i in (ids or []) if i is not None})
    if not ids:
        return {}
    _dest = destacados_vigentes_subq()
    rows = (await db.execute(
        select(_dest.c.publicacion_id, _dest.c.vence, _dest.c.prioridad)
        .where(_dest.c.publicacion_id.in_(ids))
    )).all()
    out = {}
    for pub_id, vence, prioridad in rows:
        prev = out.get(pub_id)
        if prev is None or (prioridad or 0) > prev["prioridad"]:
            out[pub_id] = {"vence": vence, "prioridad": int(prioridad or 0)}
    return out


async def fetch_page_aggregates(db: AsyncSession, pubs, campus_id: Optional[int]):
    """3 queries fijas para la página (reportes, usuarios, distancias). Sin N+1."""
    from app.models import PublicacionCampus, ReportePublicacion, Usuario

    page_ids = [p.id for p in pubs]
    rep_rows = (
        await db.execute(
            select(ReportePublicacion.publicacion_id, func.count())
            .where(
                ReportePublicacion.publicacion_id.in_(page_ids),
                ReportePublicacion.estado.in_([EstadoReporte.PENDIENTE, EstadoReporte.CONFIRMADO]),
            )
            .group_by(ReportePublicacion.publicacion_id)
        )
    ).all()
    reportes_map = {pub_id: n for pub_id, n in rep_rows}

    user_ids = {p.usuario_id for p in pubs}
    users = (
        (await db.execute(select(Usuario).where(
            Usuario.id.in_(user_ids),
            # Dueños eliminados no se hidratan (ni teléfono ni verificado).
            Usuario.eliminado_en.is_(None),
        ))).scalars().all()
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


async def resolver_ciudad_id(db, ciudad_id: Optional[int] = None, ciudad_slug: Optional[str] = None) -> Optional[int]:
    """Resuelve ciudad_slug -> ciudad_id (slug de nombre, sin tildes, '-' por espacios).

    Retorna ciudad_id directo si viene; None si no hay filtro. Lanza ValueError
    si el slug no matchea ninguna ciudad activa (el router lo vuelve 404).
    """
    if ciudad_id:
        return ciudad_id
    if not ciudad_slug or not str(ciudad_slug).strip():
        return None
    from app.models import Ciudad
    from app.services.ciudades import slugify

    wanted = slugify(str(ciudad_slug))
    rows = (await db.execute(select(Ciudad).where(Ciudad.activo.is_(True)))).scalars().all()
    for c in rows:
        if slugify(c.nombre) == wanted:
            return c.id
    raise ValueError(f"ciudad '{ciudad_slug}' no existe")


async def query_lista(db, campus_id, precio_min, precio_max, tipo, servicios, page=1, size=9, q: Optional[str] = None, ciudad_id: Optional[int] = None, ciudad_slug: Optional[str] = None):
    """COUNT + página + agregados para GET /api/publicaciones.

    Uso: routers/publicaciones.py::list_publicaciones. Ej: total, pubs, *_map, size = await query_lista(db, 1, None, None, None, None).
    Fase 2: q tokenizada (stop-words ES fuera); FTS con query limpia primero,
    fallback tokenizado OR (parciales incluidos, mayoría primero).
    q de 1-2 chars -> directo a fallback. q vacía o solo stop-words -> sin filtro.
    Multiciudad: ciudad_id o ciudad_slug filtran por zona.ciudad_id (AND con POIs).
    """
    from app.models import Publicacion

    q = q.strip() if isinstance(q, str) else None
    if q == "":
        q = None
    # Multiciudad: slug -> id (404 si slug desconocido, gestionado por el router).
    ciudad_id = await resolver_ciudad_id(db, ciudad_id, ciudad_slug)
    mode = resolver_modo_q(q)
    # Solo stop-words -> sin filtro de texto (evita [] confuso por "con de la").
    if mode and not tokenize_query(q):
        mode = None
        q = None
    offset, size_norm = paginate_params(page, size)

    async def _consultar(q_mode):
        conds = lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios, q, q_mode, ciudad_id)
        total = await count_total(db, conds, campus_id)
        if total == 0:
            return 0, [], {}, {}, {}, size_norm
        pubs = await fetch_page(db, conds, campus_id, size_norm, offset, q, q_mode)
        reportes_map, users_map, dist_map = await fetch_page_aggregates(db, pubs, campus_id)
        return total, pubs, reportes_map, users_map, dist_map, size_norm

    if mode == "fts":
        try:
            res = await _consultar("fts")
            total = res[0] if isinstance(res, tuple) else res.get("total", 0)
            if total > 0:
                return res
        except Exception as e:
            # FTS no disponible (p.ej. dialecto sin websearch_to_tsquery): cae al fallback.
            logger.warning("[búsqueda] FTS no disponible, se usa búsqueda difusa: %s", exc_resumen(e))
        return await _consultar("fuzzy")
    if mode == "fuzzy":
        return await _consultar("fuzzy")

    conds = lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios, ciudad_id=ciudad_id)
    total = await count_total(db, conds, campus_id)
    if total == 0:
        return 0, [], {}, {}, {}, size_norm
    pubs = await fetch_page(db, conds, campus_id, size_norm, offset)
    reportes_map, users_map, dist_map = await fetch_page_aggregates(db, pubs, campus_id)
    return total, pubs, reportes_map, users_map, dist_map, size_norm
