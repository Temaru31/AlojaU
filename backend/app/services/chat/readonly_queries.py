"""Consultas de SOLO LECTURA del chatbot sobre vistas `chat_v_*` (mig 021).

Todo es `select()` parametrizado sobre vistas con `security_barrier` que ya
filtran `estado='ACTIVO'` y dueño no eliminado. Este módulo no escribe, no
usa SQL crudo y no toca tablas base. La sesión (`db`) la inyecta el llamador:
en producción es la del rol `chatbot_ro`; en tests, la sesión de test.
"""
from typing import Literal

from sqlalchemy import (BigInteger, Boolean, Column, DateTime, Integer, MetaData,
                        Numeric, SmallInteger, String, Table, Text, func, or_,
                        select)

from app.services.search import escape_ilike, normalize_token, tokenize_query

_metadata = MetaData()

# Columnas espejo de las vistas chat_v_* (mig 021). Declaradas explícitas (sin
# autoload) para no necesitar conexión al importar.
chat_v_publicaciones = Table(
    "chat_v_publicaciones", _metadata,
    Column("id", BigInteger),
    Column("titulo", String(150)),
    Column("descripcion", Text),
    Column("tipo_inmueble", String(40)),
    Column("canon_mensual", Numeric(10, 2)),
    Column("deposito_requerido", Numeric(10, 2)),
    Column("incluye_servicios_base", Boolean),
    Column("reglas_convivencia", Text),
    Column("direccion_referencial", String(200)),
    Column("latitud", Numeric(10, 7)),
    Column("longitud", Numeric(10, 7)),
    Column("fecha_publicacion", DateTime(timezone=True)),
    Column("fecha_renovacion", DateTime(timezone=True)),
    Column("fecha_expiracion", DateTime(timezone=True)),
    Column("zona_barrio_id", BigInteger),
    Column("barrio_texto", String(120)),
    Column("zona_nombre", String(120)),
    Column("ciudad_nombre", String(100)),
    Column("tiene_telefono", Boolean),
    Column("num_fotos", BigInteger),
    Column("num_reportes_activos", BigInteger),
)

chat_v_publicacion_servicios = Table(
    "chat_v_publicacion_servicios", _metadata,
    Column("publicacion_id", BigInteger),
    Column("servicio_id", BigInteger),
    Column("servicio_nombre", String(80)),
)

chat_v_publicacion_campus = Table(
    "chat_v_publicacion_campus", _metadata,
    Column("publicacion_id", BigInteger),
    Column("campus_id", BigInteger),
    Column("distancia_m", Integer),
)

chat_v_imagenes = Table(
    "chat_v_imagenes", _metadata,
    Column("publicacion_id", BigInteger),
    Column("url", Text),
    Column("orden", SmallInteger),
)

chat_v_campus = Table(
    "chat_v_campus", _metadata,
    Column("id", BigInteger),
    Column("ciudad_id", BigInteger),
    Column("institucion", String(150)),
    Column("nombre_sede", String(150)),
    Column("direccion", String(200)),
    Column("latitud", Numeric(10, 7)),
    Column("longitud", Numeric(10, 7)),
    Column("categoria", String(50)),
)

chat_v_ciudades = Table(
    "chat_v_ciudades", _metadata,
    Column("id", BigInteger),
    Column("nombre", String(100)),
    Column("departamento", String(100)),
)

chat_v_zonas = Table(
    "chat_v_zonas", _metadata,
    Column("id", BigInteger),
    Column("ciudad_id", BigInteger),
    Column("nombre", String(120)),
    Column("estrato", SmallInteger),
)

chat_v_housing_types = Table(
    "chat_v_housing_types", _metadata,
    Column("slug", String(40)),
    Column("nombre_visible", String(80)),
    Column("descripcion_tooltip", Text),
    Column("icono", String(20)),
)

chat_v_servicios = Table(
    "chat_v_servicios", _metadata,
    Column("id", BigInteger),
    Column("nombre", String(80)),
    Column("categoria", String(50)),
)

_VISTAS = (
    chat_v_publicaciones, chat_v_publicacion_servicios,
    chat_v_publicacion_campus, chat_v_imagenes, chat_v_campus,
    chat_v_ciudades, chat_v_zonas, chat_v_housing_types, chat_v_servicios,
)

ORDENES_VALIDOS = ("recientes", "precio", "distancia", "confianza")

_LIMITE_MAX = 10
_TEXTO_Q_MAX = 100


def _filas(filas) -> list[dict]:
    return [dict(r) for r in filas]


def _condicion_texto(q: str | None):
    """FTS español sobre título+descripción.

    Los tokens de `tokenize_query` se parten en vocales acentuadas (regex sin
    tildes): para el tsquery se normalizan (sin tildes) y así el stemmer ES
    los casa con el documento ('habitacion' <-> 'Habitación'). Si el FTS da
    vacío, el llamador usa `_condicion_texto_ilike` (fallback del repo).
    """
    tokens = tokenize_query(q)
    if not tokens:
        return None
    normales = [normalize_token(t) for t in tokens]
    normales = [t for t in normales if t]
    if not normales:
        return None
    contenido = func.concat(
        chat_v_publicaciones.c.titulo, " ", chat_v_publicaciones.c.descripcion)
    consulta = " & ".join(normales)  # alfanuméricos puros (search.py)
    return func.to_tsvector("spanish", contenido).op("@@")(
        func.websearch_to_tsquery("spanish", consulta))


def _condicion_texto_ilike(q: str | None):
    """Fallback ILIKE-OR por token (misma filosofía del repo)."""
    tokens = tokenize_query(q)
    if not tokens:
        return None
    V = chat_v_publicaciones
    conds = []
    for tok in tokens[:10]:
        patron = f"%{escape_ilike(tok)}%"
        conds.append(V.c.titulo.ilike(patron, escape="\\"))
        conds.append(V.c.descripcion.ilike(patron, escape="\\"))
    return or_(*conds) if conds else None


async def buscar_publicaciones(
    db,
    *,
    q: str | None = None,
    campus_id: int | None = None,
    ciudad_id: int | None = None,
    precio_min: float | None = None,
    precio_max: float | None = None,
    tipo: str | None = None,
    servicio_ids: tuple[int, ...] = (),
    ordenar: Literal["recientes", "precio", "distancia", "confianza"] = "recientes",
    limit: int = 5,
    offset: int = 0,
) -> list[dict]:
    """Búsqueda pública paginada (mismos filtros que GET /api/publicaciones).

    Límites duros: `limit` 1..10, `offset` >= 0, `ordenar` en allowlist,
    `q` máx. 100 chars. Solo filas ACTIVO (la vista lo garantiza).
    """
    V = chat_v_publicaciones
    limit = max(1, min(int(limit or 5), _LIMITE_MAX))
    offset = max(0, int(offset or 0))
    if ordenar not in ORDENES_VALIDOS:
        ordenar = "recientes"
    if (precio_min is not None and precio_max is not None
            and float(precio_min) > float(precio_max)):
        return []
    stmt = _aplicar_filtros(
        select(V), campus_id, ciudad_id, precio_min, precio_max,
        tipo, servicio_ids)
    cond_texto = None
    if q and len(q) <= _TEXTO_Q_MAX:
        cond_texto = _condicion_texto(q)
        if cond_texto is not None:
            stmt = stmt.where(cond_texto)
    if ordenar == "precio":
        stmt = stmt.order_by(V.c.canon_mensual.asc(), V.c.id.asc())
    elif ordenar == "distancia" and campus_id:
        C = chat_v_publicacion_campus
        stmt = (stmt.join(C, C.c.publicacion_id == V.c.id)
                    .where(C.c.campus_id == int(campus_id))
                    .order_by(C.c.distancia_m.asc().nulls_last(),
                              V.c.id.asc()))
    else:  # recientes (y confianza: el índice se calcula en Python, Fase 2)
        stmt = stmt.order_by(V.c.fecha_renovacion.desc(), V.c.id.asc())
    stmt = stmt.limit(limit).offset(offset)
    res = await db.execute(stmt)
    filas = _filas(res.mappings().all())
    if not filas and cond_texto is not None:
        # Fallback ILIKE-OR (el FTS no casa parciales/stems raros).
        cond_fb = _condicion_texto_ilike(q)
        if cond_fb is not None:
            stmt_fb = select(V).where(cond_fb)
            # Reaplica el resto de filtros copiando la construcción base.
            stmt_fb = _aplicar_filtros(
                stmt_fb, campus_id, ciudad_id, precio_min, precio_max,
                tipo, servicio_ids)
            stmt_fb = stmt_fb.order_by(
                V.c.fecha_renovacion.desc(), V.c.id.asc()
            ).limit(limit).offset(offset)
            res = await db.execute(stmt_fb)
            filas = _filas(res.mappings().all())
    return filas


def _aplicar_filtros(stmt, campus_id, ciudad_id, precio_min, precio_max,
                     tipo, servicio_ids):
    """Filtros no-texto compartidos (construcción base reutilizable)."""
    V = chat_v_publicaciones
    if campus_id and 1 <= int(campus_id) <= 1_000_000:
        C = chat_v_publicacion_campus
        stmt = stmt.where(V.c.id.in_(
            select(C.c.publicacion_id).where(C.c.campus_id == int(campus_id))))
    if ciudad_id and 1 <= int(ciudad_id) <= 1_000_000:
        Z = chat_v_zonas
        stmt = stmt.where(V.c.zona_barrio_id.in_(
            select(Z.c.id).where(Z.c.ciudad_id == int(ciudad_id))))
    if precio_min is not None and 0 <= float(precio_min) <= 10_000_000:
        stmt = stmt.where(V.c.canon_mensual >= float(precio_min))
    if precio_max is not None and 0 <= float(precio_max) <= 10_000_000:
        stmt = stmt.where(V.c.canon_mensual <= float(precio_max))
    if tipo and len(tipo) <= 40:
        stmt = stmt.where(V.c.tipo_inmueble == tipo)
    ids = [int(s) for s in (servicio_ids or []) if 1 <= int(s) <= 1_000_000][:10]
    if ids:
        S = chat_v_publicacion_servicios
        stmt = stmt.where(V.c.id.in_(
            select(S.c.publicacion_id).where(S.c.servicio_id.in_(ids))))
    return stmt


async def obtener_publicacion(db, pub_id: int) -> dict | None:
    """Detalle público por id. None si no existe o no es ACTIVO (404 neutro)."""
    try:
        pid = int(pub_id)
    except (TypeError, ValueError):
        return None
    if not 1 <= pid <= 1_000_000:
        return None
    V = chat_v_publicaciones
    res = await db.execute(select(V).where(V.c.id == pid))
    fila = res.mappings().first()
    return dict(fila) if fila else None


async def fotos_de(db, pub_id: int, limit: int = 10) -> list[dict]:
    """Fotos ordenadas (portada primero). Vacío si el aviso no es ACTIVO."""
    try:
        pid = int(pub_id)
    except (TypeError, ValueError):
        return []
    if not 1 <= pid <= 1_000_000:
        return []
    I = chat_v_imagenes
    stmt = (select(I.c.url, I.c.orden)
            .where(I.c.publicacion_id == pid)
            .order_by(I.c.orden.asc())
            .limit(max(1, min(int(limit or 10), 10))))
    res = await db.execute(stmt)
    return _filas(res.mappings().all())


async def servicios_de(db, pub_id: int) -> list[dict]:
    """Servicios del aviso. Vacío si el aviso no es ACTIVO."""
    try:
        pid = int(pub_id)
    except (TypeError, ValueError):
        return []
    if not 1 <= pid <= 1_000_000:
        return []
    S = chat_v_publicacion_servicios
    stmt = (select(S.c.servicio_id, S.c.servicio_nombre)
            .where(S.c.publicacion_id == pid)
            .order_by(S.c.servicio_nombre.asc()))
    res = await db.execute(stmt)
    return _filas(res.mappings().all())


async def distancias_de(db, pub_ids: list[int], campus_id: int) -> dict[int, int | None]:
    """Distancia precalculada por aviso para un campus. Solo ACTIVO."""
    ids = [int(p) for p in (pub_ids or []) if 1 <= int(p) <= 1_000_000][:10]
    if not ids or not (campus_id and 1 <= int(campus_id) <= 1_000_000):
        return {}
    C = chat_v_publicacion_campus
    stmt = (select(C.c.publicacion_id, C.c.distancia_m)
            .where(C.c.publicacion_id.in_(ids),
                   C.c.campus_id == int(campus_id)))
    res = await db.execute(stmt)
    return {int(r["publicacion_id"]): r["distancia_m"]
            for r in res.mappings().all()}


async def listar_campus(db, ciudad_id: int | None = None,
                        limit: int = 50) -> list[dict]:
    """Catálogo de lugares activos (campus + POIs)."""
    C = chat_v_campus
    stmt = select(C).order_by(C.c.categoria.asc(), C.c.institucion.asc())
    if ciudad_id and 1 <= int(ciudad_id) <= 1_000_000:
        stmt = stmt.where(C.c.ciudad_id == int(ciudad_id))
    stmt = stmt.limit(max(1, min(int(limit or 50), 50)))
    res = await db.execute(stmt)
    return _filas(res.mappings().all())


async def listar_ciudades(db) -> list[dict]:
    """Ciudades activas."""
    C = chat_v_ciudades
    res = await db.execute(select(C).order_by(C.c.nombre.asc()))
    return _filas(res.mappings().all())


async def listar_zonas(db, ciudad_id: int | None = None,
                       limit: int = 100) -> list[dict]:
    """Zonas/barrios (opcional por ciudad)."""
    Z = chat_v_zonas
    stmt = select(Z).order_by(Z.c.nombre.asc())
    if ciudad_id and 1 <= int(ciudad_id) <= 1_000_000:
        stmt = stmt.where(Z.c.ciudad_id == int(ciudad_id))
    stmt = stmt.limit(max(1, min(int(limit or 100), 100)))
    res = await db.execute(stmt)
    return _filas(res.mappings().all())


async def listar_tipos(db) -> list[dict]:
    """Tipos de vivienda activos (misma fuente que el catálogo dinámico)."""
    T = chat_v_housing_types
    res = await db.execute(select(T).order_by(T.c.slug.asc()))
    return _filas(res.mappings().all())


async def listar_servicios(db) -> list[dict]:
    """Catálogo de servicios."""
    S = chat_v_servicios
    res = await db.execute(select(S).order_by(S.c.nombre.asc()))
    return _filas(res.mappings().all())


def nombres_vistas() -> tuple[str, ...]:
    """Nombres de las 9 vistas (contrato con la mig 021; usado en tests)."""
    return tuple(t.name for t in _VISTAS)
