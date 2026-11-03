"""Búsqueda pública, bandeja del dueño (/mias), su historial y la configuración pública."""
import logging
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends, Query, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.config import settings
from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PaginatedPublicaciones
from app.core.pagination import paginate_params, build_paginated
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion
from app.services.config_sistema import DEFAULTS
from app.routers.publicaciones.comun import _exigir_tipo_activo, select_con_relaciones

logger = logging.getLogger("alojau.publicaciones")
router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])


# --- Endpoints Sprint1 ---
@router.get(
    "",
    response_model=PaginatedPublicaciones,
    summary="HU-001 Buscar por sede + HU-002 Filtros + búsqueda tokenizada + multiciudad",
)
async def list_publicaciones(
    campus_id: Optional[int] = Query(
        None, ge=1, le=1000, description="FK campus_universitarios.id - filtra por lugar cercano (POIs por categoría)"
    ),
    precio_min: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP máximo"),
    # Sin pattern estático (el catálogo vive en housing_types). Se valida
    # contra la tabla (esta_activo=true) con caché 5min; 422 si no existe.
    tipo: Optional[str] = Query(
        None, min_length=3, max_length=40, description="Slug de housing_types (ej. APARTAESTUDIO)"
    ),
    servicios: Optional[str] = Query(None, max_length=50, description="IDs coma separados, ej: 1,3"),
    q: Optional[str] = Query(
        None,
        min_length=2,
        max_length=100,
        description="Texto libre tokenizado: stop-words ES fuera, OR parcial + relevancia (Fase 2)",
    ),
    ciudad_id: Optional[int] = Query(
        None, ge=1, le=1000000, description="Fase 4 multiciudad: filtra por Ciudad.id vía zona"
    ),
    ciudad_slug: Optional[str] = Query(
        None,
        min_length=2,
        max_length=100,
        pattern="^[a-z0-9-]+$",
        description="Fase 4 multiciudad: slug de ciudad, ej: popayan",
    ),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(9, ge=1, le=50, description="Tamaño página"),
    db: AsyncSession = Depends(get_session),
):
    """
    HU-001 Criterios:
      1. Al seleccionar sede se muestran publicaciones asociadas (publicacion_campus)
      2. Solo ACTIVAS
      3. Si no hay resultados -> [] + frontend muestra 'Sin resultados' (HU-001 C3)

    HU-002: precio_min <= precio_max, filtros combinables (AND).

    """
    # Validación combinada HU-002 C1
    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        raise HTTPException(status_code=400, detail="precio_min no puede superar precio_max")

    # Validación dinámica contra housing_types (sin pattern estático).
    if tipo is not None:
        await _exigir_tipo_activo(db, tipo, "tipo")

    servicios_ids = view.parse_servicios_param(servicios)

    try:
        try:
            ciudad_id_res = await repo.resolver_ciudad_id(db, ciudad_id, ciudad_slug)
        except ValueError as ve:
            raise HTTPException(status_code=404, detail=str(ve))
        total, pubs, rep_map, user_map, dist_map, size_norm = await repo.query_lista(
            db, campus_id, precio_min, precio_max, tipo, servicios_ids, page, size, q,
            ciudad_id_res, None,
        )
        mostrar = await repo.vistas_publicas(db)
        dest_map = await repo.fetch_destacados_map(db, [p.id for p in pubs])
        items = view.cards_for_page(pubs, rep_map, user_map, dist_map, campus_id, mostrar, dest_map)
        return build_paginated(items, total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        # Log real para diagnóstico en Render (no ocultar excepción)
        logger.error(f"[DB fallback] query_lista falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "list_publicaciones")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


# Mismo orden lógico que el panel: ACTIVO primero, terminales al final.
_ORDEN_ESTADOS_PANEL = [
    EstadoPublicacion.ACTIVO, EstadoPublicacion.PENDIENTE, EstadoPublicacion.PAUSADO,
    EstadoPublicacion.PAUSADO_POR_REPORTE, EstadoPublicacion.REVISION_REQUERIDA,
    EstadoPublicacion.RECHAZADO, EstadoPublicacion.ARRENDADO,
    EstadoPublicacion.EXPIRADO, EstadoPublicacion.DESACTIVADO,
]


def _orden_mis_publicaciones(orden: str) -> list:
    """Columnas ORDER BY del panel del dueño: recientes (default), vistas o estado."""
    from sqlalchemy import case

    from app.models import Publicacion

    if orden == "vistas":
        return [Publicacion.vistas.desc(), Publicacion.id.desc()]
    if orden == "estado":
        rango = case({e: i for i, e in enumerate(_ORDEN_ESTADOS_PANEL)}, value=Publicacion.estado, else_=99)
        return [rango.asc(), Publicacion.id.desc()]
    return [Publicacion.id.desc()]


@router.get(
    "/mias",
    response_model=PaginatedPublicaciones,
    summary="UX Mis publicaciones del dueño (todos los estados, paginado)",
)
async def mis_publicaciones(
    estado: Optional[str] = Query(
        None,
        pattern="^(ACTIVO|PENDIENTE|PAUSADO|PAUSADO_POR_REPORTE|REVISION_REQUERIDA|RECHAZADO|ARRENDADO|EXPIRADO|DESACTIVADO)$",
        description="Filtra por estado (default todos)",
    ),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(12, ge=1, le=50, description="Tamaño página"),
    orden: str = Query(
        "recientes",
        pattern="^(recientes|vistas|estado)$",
        description="Orden del panel: recientes (default), vistas desc o estado",
    ),
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """Lista las publicaciones del usuario autenticado en TODOS los estados
    (ACTIVO + PENDIENTE en moderación + otros), paginado, con orden server-side
    (M6: el orden en cliente mentiría con paginación multipágina).
    Sin token -> 401. Cada dueño solo ve las suyas (filtro usuario_id).
    NOTA: declarada ANTES de /{pub_id} para que "mias" no caiga en el path param."""
    uid = id_propietario(user)
    try:
        from app.models import Publicacion

        conds = [Publicacion.usuario_id == uid]
        if estado:
            conds.append(Publicacion.estado == estado)
        total_stmt = select(func.count()).select_from(Publicacion).where(*conds)
        total = (await db.execute(total_stmt)).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        order_cols = _orden_mis_publicaciones(orden)
        stmt = (
            select_con_relaciones()
            .where(*conds)
            .order_by(*order_cols)
            .limit(size_norm)
            .offset(offset)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return build_paginated([], total, page, size_norm)
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, pubs, None)
        return build_paginated(view.cards_for_page(pubs, rep_map, users_map, {}, None, True), total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        _uid_seguro = str(uid).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] mis_publicaciones {_uid_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "mis_publicaciones")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/mias/historial", summary="Dueño: actividad reciente de mis avisos")
async def mi_historial(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """Trazabilidad agregada: últimos eventos (creada, aprobada, pausada,
    renovada...) de TODOS los avisos del dueño, con título del aviso.
    Solo dueño (401/403 por contrato). Base del centro de notificaciones
    dentro de la app (ver docs/NOTIFICACIONES.md).
    """
    uid = id_propietario(user)
    try:
        from app.models import Publicacion, PublicacionesAudit

        base = (
            select(PublicacionesAudit, Publicacion.titulo)
            .join(Publicacion, PublicacionesAudit.publicacion_id == Publicacion.id)
            .where(Publicacion.usuario_id == uid)
        )
        total = (await db.execute(
            select(func.count()).select_from(PublicacionesAudit)
            .join(Publicacion, PublicacionesAudit.publicacion_id == Publicacion.id)
            .where(Publicacion.usuario_id == uid)
        )).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        rows = (await db.execute(
            base.order_by(PublicacionesAudit.id.desc()).limit(size_norm).offset(offset)
        )).all()
        return {"items": [
            {"id": a.id, "publicacion_id": a.publicacion_id, "titulo": titulo,
             "evento": a.evento, "detalle": a.detalle,
             "creado_en": a.creado_en.isoformat() if a.creado_en else None}
            for a, titulo in rows],
            "total": total, "page": page, "size": size_norm}
    except HTTPException:
        raise
    except Exception as e:
        _uid_seguro = str(uid).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] mias/historial {_uid_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "mi_historial")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

@router.get("/config-publica", summary="Config pública de validación y frescura (sin auth)")
async def config_publica(db: AsyncSession = Depends(get_session)):
    """Detalle #3: expone los settings que el frontend hardcodeaba.

    GET /api/publicaciones/config-publica -> {dias_desactualizada,
    titulo_min/max, descripcion_min/max, direccion_min/max, reglas_min/max,
    fotos_min/max, canon_max, vistas_visibles_publico}. Públicos (sin auth),
    1 query a system_settings con fallback a DEFAULTS si no hay PG. El
    frontend lo lee una vez y cachea (ver constants.js fetchConfigPublica);
    si falla, usa LIMITES locales (divergencia aceptada y documentada).
    NOTA: declarada ANTES de /{pub_id} para no caer en el path param.
    """
    _KEYS = ["dias_desactualizada", "titulo_min", "titulo_max",
             "descripcion_min", "descripcion_max", "fotos_min_publicar",
             "vistas_visibles_publico"]
    vals = {k: DEFAULTS[k][0] for k in _KEYS if k in DEFAULTS}
    try:
        from app.models import SystemSetting
        rows = (await db.execute(select(SystemSetting).where(
            SystemSetting.clave.in_(_KEYS)))).scalars().all()
        for r in rows:
            vals[r.clave] = r.valor
    except Exception as e:
        await rollback_seguro(db, "config_publica")
        # Lectura pública: nunca 503, se sirven los DEFAULTS.
        logger.warning("[config pública] ajustes desde BD fallaron: %s", exc_resumen(e))
    def _iv(k, d):
        try:
            return int(vals.get(k, d))
        except Exception:
            return d
    # Aditivo: catálogo de tipos dinámicos (caché 5min, fallback local).
    from app.services import housing_types as _ht
    tipos = await _ht.get_activos(db)  # nunca lanza: cae al catálogo estático
    return {
        "dias_desactualizada": _iv("dias_desactualizada", 30),
        "titulo_min": _iv("titulo_min", 10),
        "titulo_max": _iv("titulo_max", 150),
        "descripcion_min": _iv("descripcion_min", 20),
        "descripcion_max": _iv("descripcion_max", 2000),
        "direccion_min": 10, "direccion_max": 200,
        "reglas_min": 10, "reglas_max": 2000,
        "fotos_min": _iv("fotos_min_publicar", 3), "fotos_max": 10,
        "canon_max": 10_000_000,
        "vistas_visibles_publico": str(vals.get("vistas_visibles_publico", "false")).lower() == "true",
        "tipos_vivienda": tipos,
        # Chatbot MVP: el front oculta el widget si viene false (Fase 3).
        "chat_enabled": bool(settings.CHAT_ENABLED),
    }
