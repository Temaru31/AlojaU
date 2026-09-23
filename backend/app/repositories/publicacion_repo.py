"""Consultas SQL AlojaU (capa repositorio, sin HTTP ni DTOs).
Uso: routers/publicaciones.py. Ej: total, pubs = await repo.query_lista(db, ...)."""
from typing import List, Optional

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.pagination import paginate_params, build_paginated
from app.services.search import (
    clean_query_for_fts,
    escape_ilike,
    tipo_canonico_para_token,
    tokenize_query,
)

# Oleada 2: umbrales de búsqueda por texto (alineados al prompt táctico).
Q_MIN_FTS_LEN = 3  # q más corta -> solo fallback difuso (ILIKE/trigrama)
Q_TRGM_SIMILARITY = 0.3


def _texto_busqueda(Publicacion):
    """Expresión titulo + descripcion para FTS (ambas NOT NULL en el modelo)."""
    return Publicacion.titulo + " " + Publicacion.descripcion


def fts_condition(Publicacion, q: str):
    """Coincidencia Full-Text español (usa idx_publicaciones_fts).

    ``q`` debe venir ya limpio (tokens sin stop-words ni símbolos) vía
    clean_query_for_fts(); websearch_to_tsquery es tolerante pero así se
    evitan fallos de sintaxis con %, _, comillas, etc.
    """
    return func.to_tsvector("spanish", _texto_busqueda(Publicacion)).op("@@")(
        func.websearch_to_tsquery("spanish", q)
    )


def _token_match_or(Publicacion, token: str):
    """OR de un token sobre titulo, descripcion, zona, tipo y servicios.

    Invariante: no toca el filtro de POIs (campus_id se ANDea aparte).
    Sanitiza ILIKE escapando % _ \\ y usa unaccent para "habitacion"→"habitación".
    """
    from app.models import ServicioCatalogo, ZonaBarrio

    esc = escape_ilike(token)
    pat = f"%{esc}%"
    conds = [
        func.unaccent(Publicacion.titulo).ilike(pat, escape="\\"),
        func.unaccent(Publicacion.descripcion).ilike(pat, escape="\\"),
        Publicacion.zona.has(func.unaccent(ZonaBarrio.nombre).ilike(pat, escape="\\")),
        Publicacion.servicios.any(func.unaccent(ServicioCatalogo.nombre).ilike(pat, escape="\\")),
    ]
    canon = tipo_canonico_para_token(token)
    if canon == "HABITACION":
        conds.append(Publicacion.tipo_inmueble.like("HABITACION%"))
    elif canon:
        conds.append(Publicacion.tipo_inmueble == canon)
    else:
        conds.append(Publicacion.tipo_inmueble.ilike(pat, escape="\\"))
    return or_(*conds)


def tokens_or_condition(Publicacion, tokens: List[str]):
    """Al menos 1 token coincide (OR) — incluye parciales a propósito."""
    return or_(*[_token_match_or(Publicacion, t) for t in tokens])


def tokens_relevance(Publicacion, tokens: List[str]):
    """Score = nº de tokens que matchean (para ordenar mayoría primero)."""
    return sum(
        (case((_token_match_or(Publicacion, t), 1), else_=0) for t in tokens),
        start=0,
    )


def fuzzy_condition(Publicacion, q: str):
    """Fallback tolerante: tokenizado OR + trigramas (usa idx_publicaciones_trgm).

    - Tokeniza y filtra stop-words ES ("apartamento con baño" -> ["apartamento","baño"]).
    - Si no quedan tokens significativos, retorna None (sin filtro de texto).
    - Si hay 1 token corto, conserva trigramas/ILIKE clásico para typos.
    """
    tokens = tokenize_query(q)
    if not tokens:
        return None
    per_token = [_token_match_or(Publicacion, t) for t in tokens]
    # Trigrama solo con el primer token (typos cortos); el resto va por ILIKE tokenizado.
    trigram = func.similarity(Publicacion.titulo, tokens[0]) > Q_TRGM_SIMILARITY
    return or_(trigram, *per_token)


def ts_rank_order(Publicacion, q: str):
    """Relevancia FTS (mayor primero)."""
    return func.ts_rank(
        func.to_tsvector("spanish", _texto_busqueda(Publicacion)),
        func.websearch_to_tsquery("spanish", q),
    ).desc()


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


async def leer_ajuste(db, clave: str, default: str) -> str:
    """Lee system_settings (clave UNIQUE, 1 query). Sin tabla/fila -> default."""
    try:
        from app.models import SystemSetting as _SS
        row = (await db.execute(
            select(_SS).where(_SS.clave == clave))).scalars().first()
        return row.valor if row else default
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        return default


async def vistas_publicas(db) -> bool:
    """¿Ve todo visitante el contador? Default False (prudente: dueño/admin)."""
    return (await leer_ajuste(db, "vistas_visibles_publico", "false")).lower() == "true"


def lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios, q: Optional[str] = None, q_mode: Optional[str] = None, ciudad_id: Optional[int] = None):
    """Filtros HU-001/002 + Oleada 2 (q tokenizada) + multiciudad compartidos por COUNT y página."""
    conds = [Publicacion.estado == "ACTIVO", dueno_activo_clause(Publicacion)]
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


def resolver_modo_q(q: Optional[str]) -> Optional[str]:
    """Normaliza q y elige modo: None (sin búsqueda), 'fts' (>=3 chars) o 'fuzzy' (<3)."""
    if q is None:
        return None
    q = q.strip()
    if not q:
        return None
    return "fts" if len(q) >= Q_MIN_FTS_LEN else "fuzzy"


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
    tokens = tokenize_query(q) if q else []
    fts_q = clean_query_for_fts(tokens) if tokens else None
    if campus_id:
        stmt = (
            stmt.join(PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id)
            .where(PublicacionCampus.campus_id == campus_id)
        )
        if q_mode == "fts" and fts_q:
            stmt = stmt.order_by(
                ts_rank_order(Publicacion, fts_q),
                tokens_relevance(Publicacion, tokens).desc() if tokens else Publicacion.id.asc(),
                Publicacion.fecha_renovacion.desc(),
                Publicacion.id.asc(),
            )
        elif tokens:
            stmt = stmt.order_by(
                tokens_relevance(Publicacion, tokens).desc(),
                Publicacion.fecha_renovacion.desc(),
                Publicacion.id.asc(),
            )
        else:
            stmt = stmt.order_by(PublicacionCampus.distancia_geodesica_m.asc().nullslast(), Publicacion.id.asc())
    elif q_mode == "fts" and fts_q:
        stmt = stmt.order_by(
            ts_rank_order(Publicacion, fts_q),
            tokens_relevance(Publicacion, tokens).desc() if tokens else Publicacion.id.asc(),
            Publicacion.fecha_renovacion.desc(),
            Publicacion.id.asc(),
        )
    elif tokens:
        stmt = stmt.order_by(
            tokens_relevance(Publicacion, tokens).desc(),
            Publicacion.fecha_renovacion.desc(),
            Publicacion.id.asc(),
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
        (await db.execute(select(Usuario).where(
            Usuario.id.in_(user_ids),
            # v14.1: dueños eliminados no se hidratan (ni teléfono ni verificado).
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
        except Exception:
            # FTS no disponible (p.ej. dialecto sin websearch_to_tsquery): cae al fallback.
            pass
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


async def fetch_detail_campus_ref(db: AsyncSession, pub_id: int, campus_id: int):
    """Fila publicacion_campus + lugar para GET detalle ?campus_id= (004 POIs).

    Retorna (dist_m, campus) o (None, None) si el aviso no tiene coords
    (edge case: la fila existe con dist NULL por B0-5/trigger). Lanza 404 si
    el lugar no existe o está inactivo. Uso: routers/publicaciones.py.
    """
    from fastapi import HTTPException

    from app.models import CampusUniversitario, PublicacionCampus

    campus = await db.get(CampusUniversitario, campus_id)
    if not campus or not campus.activo:
        raise HTTPException(status_code=404, detail=f"campus_id {campus_id} no existe o inactivo")
    row = await db.get(PublicacionCampus, (pub_id, campus_id))
    dist = row.distancia_geodesica_m if row else None
    return dist, campus


async def validate_fks(db: AsyncSession, zona_id: int | None, campus_ids: List[int], servicios_ids: List[int]):
    """FK estrictas + dedup (404 si zona/campus inactivo/servicio falta).
    Tarea 3 (v10): zona_id None = barrio libre (barrio_texto), se omite el chequeo.
    Uso: routers/publicaciones.py::crear_publicacion. Ej: cids, sids = await validate_fks(db, 1, [1, 1], [1])."""
    from fastapi import HTTPException

    from app.models import CampusUniversitario, ServicioCatalogo, ZonaBarrio

    campus_ids = list(dict.fromkeys(campus_ids or []))
    servicios_ids = list(dict.fromkeys(servicios_ids))
    if zona_id is not None and not await db.get(ZonaBarrio, zona_id):
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
        barrio_texto=(payload.barrio_texto or None),
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
    # 004 POIs: el trigger trg_publicacion_recalcular_distancias ya insertó
    # filas para TODOS los lugares activos en el flush anterior. Reescribir las
    # elegidas (mismo valor) evita violar la PK (publicacion_id, campus_id).
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(PublicacionCampus).where(
            PublicacionCampus.publicacion_id == nueva.id,
            PublicacionCampus.campus_id.in_(campus_ids),
        )
    )
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


async def renovar_publicacion(db: AsyncSession, pub_id: int, user_id: int) -> dict:
    """Renueva la vigencia de una publicación por exactamente 30 días calendario (PA-01).

    Reglas de negocio:
    - Solo el dueño (user_id == publicacion.usuario_id) puede renovar.
    - Si fecha_expiracion > ahora: nueva = fecha_expiracion_actual + 30 días.
    - Si ya venció:               nueva = ahora + 30 días.
    - EXPIRADO → estado pasa a ACTIVO tras la renovación.
    - RECHAZADO / DESACTIVADO → fecha renovada pero estado no cambia.
    - Genera fila de auditoría con evento 'RENEWED'.

    Uso: routers/publicaciones.py::renovar.
    Ej: datos = await renovar_publicacion(db, 25, 1).
    Retorna dict con id, estado, fecha_expiracion_anterior, fecha_expiracion_nueva, dias_agregados, mensaje.
    Lanza HTTPException 404/403.
    """
    import json
    from datetime import datetime, timezone, timedelta
    from fastapi import HTTPException
    from app.models import Publicacion, PublicacionesAudit as PublicacionAudit

    # 1. Cargar publicación (404 si no existe)
    p = await db.get(Publicacion, pub_id)
    if not p:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")

    # 2. Verificar propiedad (403 si no es el dueño)
    if p.usuario_id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para renovar esta publicación.")

    # 3. Calcular nueva fecha de expiración (30 días reales exactos)
    now = datetime.now(timezone.utc)
    fecha_anterior = p.fecha_expiracion

    # Asegurar que fecha_anterior tiene tzinfo para comparar
    if fecha_anterior.tzinfo is None:
        fecha_anterior = fecha_anterior.replace(tzinfo=timezone.utc)

    if fecha_anterior > now:
        # Publicación vigente: extender desde la fecha actual de expiración
        fecha_nueva = fecha_anterior + timedelta(days=30)
    else:
        # Publicación vencida: nueva vigencia desde ahora
        fecha_nueva = now + timedelta(days=30)

    # 4. Actualizar estado si la publicación está EXPIRADA
    estado_anterior = p.estado
    if p.estado == "EXPIRADO":
        p.estado = "ACTIVO"
    # RECHAZADO y DESACTIVADO conservan su estado por regla de negocio explícita

    # 5. Actualizar fechas
    p.fecha_expiracion = fecha_nueva
    p.fecha_renovacion = now

    # 6. Insertar fila de auditoría
    detalle = json.dumps({
        "fecha_expiracion_anterior": fecha_anterior.isoformat(),
        "fecha_expiracion_nueva": fecha_nueva.isoformat(),
        "estado_anterior": estado_anterior,
        "estado_nuevo": p.estado,
    }, ensure_ascii=False)
    db.add(PublicacionAudit(
        publicacion_id=p.id,
        usuario_id=user_id,
        evento="RENEWED",
        detalle=detalle,
    ))

    await db.commit()
    await db.refresh(p)

    return {
        "id": p.id,
        "estado": p.estado,
        "fecha_expiracion_anterior": fecha_anterior,
        "fecha_expiracion_nueva": fecha_nueva,
        "dias_agregados": 30,
        "mensaje": "La publicación fue renovada exitosamente.",
    }
