"""
routers/publicaciones.py - HU-001,002,003,005,007 (Sprint1) + Mis publicaciones (UX) + PA-01 Renovación
Endpoints:
  GET   /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
  GET   /api/publicaciones/mias                                                 (UX: dueño, todos los estados)
  GET   /api/publicaciones/{id}                                                 (HU-003+007)
  POST  /api/publicaciones                                                      (HU-005 -> PENDIENTE, solo ARRENDADOR)
  PATCH /api/publicaciones/{id}                                                 (UX editar aviso del dueño)
  PATCH /api/publicaciones/{id}/renovar                                         (PA-01 renovación 30 días)

Sprint1: mock lista en memoria si no hay PG (frontend no se bloquea). Si hay PG, query real con Haversine + TrustScoreEngine.
NFR P95<500ms: query indexada (estado, zona, canon), sin N+1, Haversine en memoria/Python.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status, Header, Request
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.config import settings
from app.core.security import get_current_user, get_optional_user
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import (
    PublicacionCreate,
    PublicacionCreatedOut,
    PublicacionCardOut,
    PublicacionDetailOut,
    PublicacionUpdate,
    PaginatedPublicaciones,
    RenovacionOut,
)
from app.core.pagination import paginate_params, build_paginated
from pydantic import BaseModel, Field
import logging
logger = logging.getLogger("alojau.publicaciones")

router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])

def _mock_enabled() -> bool:
    # B0-2 fail-closed: mock solo en dev/test con flag True.
    return bool(getattr(settings, "mock_enabled", False))

def _is_owner_or_admin(user: dict | None, owner_id: int | None) -> bool:
    if not user:
        return False
    if user.get("rol") == "ADMIN":
        return True
    try:
        return int(user.get("id")) == int(owner_id) if owner_id is not None else False
    except Exception:
        return False

# v15.2 throttle de vistas: 120/min por IP (memoria en mock, PG en real).
_VISTAS_MEM: dict[str, list[float]] = {}
_VISTAS_MEM_LIMIT = 120
_VISTAS_MEM_WINDOW_S = 60.0
_VISTAS_MOCK_SET: set[tuple[int, str]] = set()


async def _db_rate_check_vista(db: AsyncSession, ip: str) -> None:
    """Throttle anti-inflado de vistas. PG en real, memoria en mock/dev."""
    import time as _t
    if _mock_enabled():
        ahora = _t.monotonic()
        hist = [x for x in _VISTAS_MEM.get(ip, []) if ahora - x < _VISTAS_MEM_WINDOW_S]
        if len(hist) >= _VISTAS_MEM_LIMIT:
            raise HTTPException(status_code=429, detail="Demasiadas vistas, espera un minuto")
        hist.append(ahora)
        _VISTAS_MEM[ip] = hist
        return
    try:
        from app.routers.auth import _db_rate_check as _check, _db_rate_record as _rec
        await _check(db, f"vista:{ip}", limite=_VISTAS_MEM_LIMIT,
                     ventana_s=int(_VISTAS_MEM_WINDOW_S))
        await _rec(db, f"vista:{ip}", False)
    except HTTPException:
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass

# --- MOCK Sprint1 (si no hay PG, solo dev) ---
# MOCK_CAMPUS canónico en app/fixtures/demo.py. MOCK_PUBS simula filas.
# Cada mock simula fila Publicacion + relaciones
MOCK_PUBS = [
    {
        "id": 1, "titulo": "Habitación cerca Tulcán", "descripcion": "Amoblada, baño privado, WiFi 200MB",
        "tipo_inmueble": "HABITACION_INDEPENDIENTE", "canon_mensual": 450000, "deposito_requerido": 200000,
        "zona_barrio_id": 1, "zona_nombre": "Pandiguando", "direccion_referencial": "Cerca Tulcán, 2 cuadras",
        "reglas_convivencia": "No mascotas, visitas hasta 9pm", "estado": "ACTIVO",
        "fecha_renovacion": datetime.now(timezone.utc) - timedelta(days=5),
        "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=25),
        "servicios": ["WiFi","Baño privado"], "servicios_ids": [1,2],
        "fotos": ["https://res.cloudinary.com/demo/image1.jpg","https://res.cloudinary.com/demo/image2.jpg","https://res.cloudinary.com/demo/image3.jpg","https://res.cloudinary.com/demo/image4.jpg"],
        "latitud": 2.444, "longitud": -76.605, "campus_ids": [1],
        "usuario_id": 1, "telefono_whatsapp": "573001234567", "telefono_verificado": True, "reportes_activos": 0,
    },
    {
        "id": 2, "titulo": "Apartaestudio amoblado Centro", "descripcion": "1 ambiente, cocina integral, lavadora",
        "tipo_inmueble": "APARTAESTUDIO", "canon_mensual": 700000, "deposito_requerido": 0,
        "zona_barrio_id": 2, "zona_nombre": "Centro", "direccion_referencial": "Centro histórico, cerca Claustro",
        "reglas_convivencia": "No fiestas, contrato mínimo 6 meses", "estado": "ACTIVO",
        "fecha_renovacion": datetime.now(timezone.utc) - timedelta(days=20),
        "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=10),
        "servicios": ["WiFi","Amoblado","Lavadora"], "servicios_ids": [1,3,4],
        "fotos": ["https://res.cloudinary.com/demo/a1.jpg","https://res.cloudinary.com/demo/a2.jpg","https://res.cloudinary.com/demo/a3.jpg"],
        "latitud": 2.442, "longitud": -76.600, "campus_ids": [1,2],
        "usuario_id": 2, "telefono_whatsapp": "573009998877", "telefono_verificado": False, "reportes_activos": 0,
    },
    {
        "id": 3, "titulo": "Habitación familiar Tulcán", "descripcion": "Familiar, comparte cocina, ideal estudiante",
        "tipo_inmueble": "HABITACION_FAMILIAR", "canon_mensual": 380000, "deposito_requerido": 150000,
        "zona_barrio_id": 1, "zona_nombre": "Pandiguando", "direccion_referencial": "Pandiguando, Tulcán",
        "reglas_convivencia": "Convivencia familiar, aseo compartido", "estado": "PENDIENTE",  # no visible en búsqueda
        "fecha_renovacion": datetime.now(timezone.utc),
        "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=30),
        "servicios": ["WiFi"], "servicios_ids": [1],
        "fotos": ["https://res.cloudinary.com/demo/f1.jpg","https://res.cloudinary.com/demo/f2.jpg","https://res.cloudinary.com/demo/f3.jpg"],
        "latitud": 2.4435, "longitud": -76.6065, "campus_ids": [1],
        "usuario_id": 1, "telefono_whatsapp": "573001234567", "telefono_verificado": True, "reportes_activos": 1, # 1 reporte PENDIENTE -> pierde 10
    },
]

# --- Endpoints Sprint1 ---
@router.get("", response_model=PaginatedPublicaciones, summary="HU-001 Buscar por sede + HU-002 Filtros + búsqueda tokenizada + multiciudad")
async def list_publicaciones(
    campus_id: Optional[int] = Query(None, ge=1, le=1000, description="FK campus_universitarios.id - filtra por lugar cercano (POIs por categoría)"),
    precio_min: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP máximo"),
    # M2: sin pattern estático (el catálogo vive en housing_types). Se valida
    # contra la tabla (esta_activo=true) con caché 5min; 422 si no existe.
    tipo: Optional[str] = Query(None, min_length=3, max_length=40, description="Slug de housing_types (ej. APARTAESTUDIO)"),
    servicios: Optional[str] = Query(None, max_length=50, description="IDs coma separados, ej: 1,3"),
    q: Optional[str] = Query(None, min_length=2, max_length=100, description="Texto libre tokenizado: stop-words ES fuera, OR parcial + relevancia (Fase 2)"),
    ciudad_id: Optional[int] = Query(None, ge=1, le=1000000, description="Fase 4 multiciudad: filtra por Ciudad.id vía zona"),
    ciudad_slug: Optional[str] = Query(None, min_length=2, max_length=100, pattern="^[a-z0-9-]+$", description="Fase 4 multiciudad: slug de ciudad, ej: popayan"),
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

    Sprint1: intenta DB real; si falla (PG caído / sin .env), usa MOCK_PUBS para no bloquear frontend.
    """
    # Validación combinada HU-002 C1
    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        raise HTTPException(status_code=400, detail="precio_min no puede superar precio_max")

    # M2 validación dinámica contra housing_types (esta_activo=true, caché 5min).
    # Sin pattern estático: 422 si el slug no existe o está inactivo.
    if tipo is not None:
        try:
            from app.services import housing_types as _ht
            activos = await _ht.slugs_activos(db)
            if tipo not in activos:
                raise HTTPException(status_code=422, detail=f"tipo '{tipo}' no válido o inactivo")
        except HTTPException:
            raise
        except Exception:
            try:
                await db.rollback()
            except Exception:
                pass
            # Sin PG: fallback estático (mock dev) para no tumbar la búsqueda.
            try:
                from app.services.housing_types import slugs_fallback as _fb
                if tipo not in _fb():
                    raise HTTPException(status_code=422, detail=f"tipo '{tipo}' no válido o inactivo")
            except HTTPException:
                raise

    servicios_ids = view.parse_servicios_param(servicios)

    # Intento DB real con fallback mock solo en dev (fail-closed 503 en prod)
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
        items = view.cards_for_page(pubs, rep_map, user_map, dist_map, campus_id, mostrar)
        return build_paginated(items, total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        # Log real para diagnóstico en Render (no ocultar excepción)
        logger.error(f"[DB fallback] query_lista falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        logger.warning(f"[Sprint1 mock fallback] DB no disponible: {e!r}")
        filtradas = view.filter_mock_pubs(
            MOCK_PUBS, campus_id, precio_min, precio_max, tipo, servicios_ids, q,
            ciudad_id=ciudad_id, ciudad_slug=ciudad_slug,
        )
        items = [view.mock_to_out(p, campus_id, False) for p in filtradas]
        total = len(items)
        offset, size_norm = paginate_params(page, size)
        paginated_items = items[offset:offset+size_norm]
        return build_paginated(paginated_items, total, page, size_norm)

@router.get("/mias", response_model=PaginatedPublicaciones, summary="UX Mis publicaciones del dueño (todos los estados, paginado)")
async def mis_publicaciones(
    estado: Optional[str] = Query(None, pattern="^(ACTIVO|PENDIENTE|PAUSADO|PAUSADO_POR_REPORTE|REVISION_REQUERIDA|RECHAZADO|ARRENDADO|EXPIRADO|DESACTIVADO)$", description="Filtra por estado (default todos)"),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(12, ge=1, le=50, description="Tamaño página"),
    orden: str = Query("recientes", pattern="^(recientes|vistas|estado)$",
                       description="Orden del panel: recientes (default), vistas desc o estado"),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Lista las publicaciones del usuario autenticado en TODOS los estados
    (ACTIVO + PENDIENTE en moderación + otros), paginado, con orden server-side
    (M6: el orden en cliente mentiría con paginación multipágina).
    Sin token -> 401. Cada dueño solo ve las suyas (filtro usuario_id).
    NOTA: declarada ANTES de /{pub_id} para que "mias" no caiga en el path param."""
    uid = user.get("id")
    # F1: token sin id entero válido -> 401 (nunca filtrar por dueño ajeno).
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion
        from sqlalchemy import case as _case

        conds = [Publicacion.usuario_id == uid]
        if estado:
            conds.append(Publicacion.estado == estado)
        total_stmt = select(func.count()).select_from(Publicacion).where(*conds)
        total = (await db.execute(total_stmt)).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        if orden == "vistas":
            order_cols = [Publicacion.vistas.desc(), Publicacion.id.desc()]
        elif orden == "estado":
            # Mismo orden lógico que el panel (ACTIVO primero, terminales al final).
            order_cols = [_case(
                {e: i for i, e in enumerate([
                    "ACTIVO", "PENDIENTE", "PAUSADO", "PAUSADO_POR_REPORTE",
                    "REVISION_REQUERIDA", "RECHAZADO", "ARRENDADO",
                    "EXPIRADO", "DESACTIVADO"])},
                value=Publicacion.estado, else_=99,
            ).asc(), Publicacion.id.desc()]
        else:
            order_cols = [Publicacion.id.desc()]
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
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
        logger.error(f"[DB fallback] mis_publicaciones {uid} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock fallback solo dev: filtra por dueño (incluye PENDIENTE, es su bandeja) + pagina en memoria.
    # Mismo contrato de orden que la rama DB (M6).
    filtradas = [p for p in MOCK_PUBS if p.get("usuario_id") == uid]
    if estado:
        filtradas = [p for p in filtradas if p.get("estado") == estado]
    if orden == "vistas":
        filtradas.sort(key=lambda p: (-(p.get("vistas", 0) or 0), -p["id"]))
    elif orden == "estado":
        _rango = {"ACTIVO": 0, "PENDIENTE": 1, "PAUSADO": 2, "PAUSADO_POR_REPORTE": 3,
                  "REVISION_REQUERIDA": 4, "RECHAZADO": 5, "ARRENDADO": 6,
                  "EXPIRADO": 7, "DESACTIVADO": 8}
        filtradas.sort(key=lambda p: (_rango.get(p.get("estado"), 99), -p["id"]))
    else:
        filtradas.sort(key=lambda p: p["id"], reverse=True)
    total = len(filtradas)
    offset, size_norm = paginate_params(page, size)
    items = [view.mock_to_out(p, None, True) for p in filtradas[offset:offset + size_norm]]
    return build_paginated(items, total, page, size_norm)

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
    from app.routers.admin_automation import DEFAULTS as _DEF
    _KEYS = ["dias_desactualizada", "titulo_min", "titulo_max",
             "descripcion_min", "descripcion_max", "fotos_min_publicar",
             "vistas_visibles_publico"]
    vals = {k: _DEF[k][0] for k in _KEYS if k in _DEF}
    try:
        from app.models import SystemSetting
        rows = (await db.execute(select(SystemSetting).where(
            SystemSetting.clave.in_(_KEYS)))).scalars().all()
        for r in rows:
            vals[r.clave] = r.valor
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        # Sin PG (dev mock): DEFAULTS. Nunca 503 en lectura pública.
    def _iv(k, d):
        try:
            return int(vals.get(k, d))
        except Exception:
            return d
    # M2 aditivo: catálogo de tipos dinámicos (caché 5min, fallback local).
    try:
        from app.services import housing_types as _ht
        tipos = await _ht.get_activos(db)
    except Exception:
        try:
            from app.services.housing_types import MOCK_TIPOS as _MT
            tipos = [dict(t) for t in _MT if t.get("esta_activo")]
        except Exception:
            tipos = []
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
    }

@router.get("/{pub_id}", response_model=PublicacionDetailOut, summary="HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp")
async def get_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    campus_id: Optional[int] = Query(None, ge=1, le=1000000, description="004 POIs: resuelve campus_ref (distancia a ESTE lugar) para sincronizar el mapa del Detalle"),
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    HU-003: muestra canon, servicios, fotos, zona, condiciones, vigencia
            No expone datos que no deban ser públicos (email propietario, etc)
    HU-007: incluye indice_confianza 0-100 + desglose 40+20+15+15+10 + disclaimer
    HU-008: telefono_whatsapp solo si verificado + whatsapp_url wa.me
    PENDIENTE (y no-ACTIVO) es privado -> 404 salvo owner/admin.
    """
    current_user = await get_optional_user(authorization)
    try:
        p, reportes_activos, u, dist_detalle = await repo.fetch_detail_bundle(db, pub_id)
        if p:
            # v14.1 Ley 1581: dueño eliminado -> invisible salvo ADMIN
            # (la búsqueda ya los excluye; esto cubre acceso directo por URL).
            if (u is not None and getattr(u, "eliminado_en", None) is not None
                    and not (current_user and current_user.get("rol") == "ADMIN")):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            # Detalle no-ACTIVO privado (404 para no filtrar existencia).
            if p.estado != "ACTIVO" and not _is_owner_or_admin(current_user, p.usuario_id):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            # 004 POIs: referencia al lugar buscado (el mapa del Detalle se
            # sincroniza a ESTE punto; sin campus_id se usa la distancia mínima).
            campus_ref = None
            dist = dist_detalle
            if campus_id is not None:
                from app.services.haversine import tiempo_pie_min
                dist_ref, lugar = await repo.fetch_detail_campus_ref(db, pub_id, campus_id)
                dist = dist_ref
                campus_ref = {
                    "campus_id": lugar.id,
                    "institucion": lugar.institucion,
                    "nombre_sede": lugar.nombre_sede,
                    "latitud": float(lugar.latitud),
                    "longitud": float(lugar.longitud),
                    "dist_m": dist_ref,
                    "tiempo_pie_min": tiempo_pie_min(dist_ref),
                }
            return view.build_detail(
                p, reportes_activos, u, dist, campus_ref,
                await repo.vistas_publicas(db) or _is_owner_or_admin(current_user, p.usuario_id),
            )
    except HTTPException:
        raise
    except Exception as e:
        # CWE-117: pub_id viene del path; sanear CR/LF antes de loguear.
        safe_pub_id = str(pub_id).replace("\r", "").replace("\n", "")
        logger.error(f"[DB fallback] get_publicacion {safe_pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        logger.warning(f"[DB fallback] get_publicacion {safe_pub_id}: {e!r}")

    # Mock fallback solo dev. No-ACTIVO privado también en mock.
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((p for p in MOCK_PUBS if p["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if pub.get("estado") != "ACTIVO" and not _is_owner_or_admin(current_user, pub.get("usuario_id")):
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    # 004 POIs mock: misma forma que la rama DB (distancia a ESTE lugar + ref).
    if campus_id is not None:
        from app.fixtures.demo import MOCK_CAMPUS
        from app.services.haversine import haversine_m, tiempo_pie_min
        if campus_id not in MOCK_CAMPUS:
            raise HTTPException(status_code=404, detail=f"campus_id {campus_id} no existe o inactivo")
        lugar = MOCK_CAMPUS[campus_id]
        dist_ref = None
        if pub.get("latitud") is not None and pub.get("longitud") is not None:
            dist_ref = haversine_m(pub["latitud"], pub["longitud"], lugar["lat"], lugar["lng"])
        out = view.mock_to_out(pub, campus_id,
                               _is_owner_or_admin(current_user, pub.get("usuario_id")))
        out["campus_ref"] = {
            "campus_id": campus_id,
            "institucion": lugar["institucion"],
            "nombre_sede": lugar["nombre_sede"],
            "latitud": float(lugar["latitud"]),
            "longitud": float(lugar["longitud"]),
            "dist_m": dist_ref,
            "tiempo_pie_min": tiempo_pie_min(dist_ref),
        }
        return out
    return view.mock_to_out(pub, None,
                            _is_owner_or_admin(current_user, pub.get("usuario_id")))

@router.patch("/{pub_id}", response_model=PublicacionCardOut, summary="UX Editar aviso del dueño (solo owner/ADMIN)")
async def editar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: PublicacionUpdate = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Edición parcial del dueño: escalares + `servicios_ids` opcional
    (reemplazo total de etiquetas, con FK validadas). Las fotos van por
    PATCH /{id}/fotos (reconciliación atómica, M4).
    401 sin token o sin id válido, 403 si no es dueño ni ADMIN, 404 si no existe,
    422 si algún campo viola cotas (iguales a Create) o el body viene vacío.
    El estado NO cambia con la edición. Sin fila de audit: el CHECK de
    publicaciones_audit no tiene evento EDITED (migración pendiente)."""
    cambios = {k: v for k, v in payload.model_dump().items() if v is not None}
    servicios_nuevos = cambios.pop("servicios_ids", None)
    if servicios_nuevos is not None:
        servicios_nuevos = list(dict.fromkeys(servicios_nuevos))
    # M4 commit único: el set de fotos viaja en el mismo PATCH (ya validado
    # por el schema). Un solo commit para escalares + etiquetas + fotos.
    fotos_nuevas = cambios.pop("fotos", None)
    # M2: si cambia el tipo, validar contra housing_types (esta_activo=true).
    if "tipo_inmueble" in cambios:
        try:
            from app.services import housing_types as _ht
            activos = await _ht.slugs_activos(db)
            if cambios["tipo_inmueble"] not in activos:
                raise HTTPException(status_code=422, detail=f"tipo_inmueble '{cambios['tipo_inmueble']}' no válido o inactivo")
        except HTTPException:
            raise
        except Exception:
            pass
    try:
        from app.models import Publicacion, PublicacionServicio, ServicioCatalogo

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar")
        if servicios_nuevos is not None:
            for sid in servicios_nuevos:
                if not await db.get(ServicioCatalogo, sid):
                    raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
        for k, v in cambios.items():
            setattr(p, k, v)
        if servicios_nuevos is not None:
            await db.execute(
                PublicacionServicio.__table__.delete().where(
                    PublicacionServicio.publicacion_id == pub_id)
            )
            for sid in servicios_nuevos:
                db.add(PublicacionServicio(publicacion_id=pub_id, servicio_id=sid))
        if fotos_nuevas is not None:
            await _reconciliar_fotos_urls(db, pub_id, list(fotos_nuevas))
        await db.commit()
        # La sesión usa expire_on_commit=False: el DELETE Core no invalida la
        # colección ORM en el identity map y el re-read la traería rancia.
        # Se expira explícitamente antes de releer con eager loading.
        # OJO: AsyncSession.expire es síncrono (no lleva await; await None
        # lanzaría TypeError y caería al fallback mock con 404 fantasma).
        db.expire(p, ["servicios"])
        # Re-lee con eager loading (refresh() no recarga relaciones en async).
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(Publicacion.id == pub_id)
        )
        p = (await db.execute(stmt)).scalars().unique().one()
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, [p], None)
        return view.cards_for_page([p], rep_map, users_map, {}, None, True)[0]
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB fallback] editar {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock fallback solo dev.
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _is_owner_or_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede editar")
    if fotos_nuevas is not None:
        # Mock dev: el set ya viene validado por el schema; reemplazo directo.
        pub["fotos"] = list(fotos_nuevas)
    if servicios_nuevos is not None:
        # Mock dev: espejo del reemplazo con el MISMO contrato que PG
        # (catálogo seed 1-5, máx 10, dedup). Sin PG no hay más servicios.
        _nombres = {1: "WiFi Fibra", 2: "Baño Privado", 3: "Cocina Compartida",
                    4: "Amoblado", 5: "Lavadora"}
        if len(servicios_nuevos) > 10:
            raise HTTPException(status_code=422, detail="máximo 10 servicios")
        for sid in servicios_nuevos:
            if sid not in _nombres:
                raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
        pub["servicios_ids"] = list(servicios_nuevos)
        pub["servicios"] = [_nombres[sid] for sid in servicios_nuevos]
    pub.update(cambios)
    return view.mock_to_out(pub, None, True)


async def _reconciliar_fotos_urls(db: AsyncSession, pub_id: int, urls: list[str]) -> list:
    """Alta/baja/reorden de fotos en UNA pasada (sin commit).

    Fuente única para PATCH /{id} (campo `fotos`) y PATCH /{id}/fotos.
    Las URLs ya vienen normalizadas y validadas. Usa orden temporal 1000+i
    para no violar UNIQUE(publicacion_id, orden) a mitad de camino.
    Retorna las filas finales ordenadas por orden.
    """
    from app.models import ImagenPublicacion

    actuales = (await db.execute(
        select(ImagenPublicacion).where(
            ImagenPublicacion.publicacion_id == pub_id)
    )).scalars().all()
    por_url = {r.url: r for r in actuales}
    vistas = set(urls)
    for r in actuales:
        if r.url not in vistas:
            await db.delete(r)
    await db.flush()
    vivas = [por_url[u] for u in urls if u in por_url]
    for i, row in enumerate(vivas):
        row.orden = 1000 + i
    await db.flush()
    for i, url in enumerate(urls, start=1):
        row = por_url.get(url)
        if row is not None and url in vistas:
            row.orden = i
        else:
            db.add(ImagenPublicacion(publicacion_id=pub_id, url=url, orden=i))
    await db.flush()
    return (await db.execute(
        select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
        .order_by(ImagenPublicacion.orden.asc())
    )).scalars().all()


class FotosSetIn(BaseModel):
    """Set completo y ordenado de fotos (la posición 0 es la portada)."""
    fotos: list[str] = Field(min_length=1, max_length=10)


@router.patch("/{pub_id}/fotos", summary="Dueño: reemplazar set de fotos (atómico)")
async def reemplazar_fotos(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: FotosSetIn = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """M4 edición bufferizada: el frontend acumula altas/bajas/reorden en
    estado local y commitea UNA vez aquí (1 transacción: altas + bajas +
    reorden 1..N). Solo dueño o ADMIN. 401/403/404/422.

    Las URLs deben venir de `POST /upload/una` (storage) o externas http(s);
    duplicadas o no-http → 422. Sin fila de audit (sin evento FOTOS en el
    CHECK de auditoría).
    """
    urls = [str(u or "").strip()[:500] for u in (payload.fotos or []) if str(u or "").strip()]
    if not urls:
        raise HTTPException(status_code=422, detail="fotos vacío")
    if len(urls) > 10:
        raise HTTPException(status_code=422, detail="Máximo 10 fotos por aviso")
    if len(set(urls)) != len(urls):
        raise HTTPException(status_code=422, detail="fotos duplicadas")
    for u in urls:
        if not (u.startswith("https://") or u.startswith("http://")):
            raise HTTPException(status_code=422, detail="URLs deben ser http(s)")
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import ImagenPublicacion, Publicacion

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar fotos")
        await _reconciliar_fotos_urls(db, pub_id, urls)
        await db.commit()
        filas = (await db.execute(
            select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
            .order_by(ImagenPublicacion.orden.asc())
        )).scalars().all()
        return {"id": pub_id,
                "fotos": [r.url for r in filas],
                "imagenes": [{"id": r.id, "url": r.url, "orden": r.orden} for r in filas],
                "total": len(filas)}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB fallback] fotos {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _is_owner_or_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede editar fotos")
    pub["fotos"] = list(urls)
    return {"id": pub_id, "fotos": list(urls),
            "imagenes": view._mock_imagenes(pub), "total": len(urls), "mock": True}


@router.patch("/{pub_id}/renovar", response_model=RenovacionOut, summary="PA-01 Renovar vigencia 30 días (solo propietario)")
async def renovar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """
    PA-01: Renueva la vigencia de una publicación por 30 días calendario exactos.

    Reglas:
    - 401 sin token válido.
    - 403 si el usuario autenticado no es el dueño de la publicación.
    - 404 si la publicación no existe.
    - Vigente:  nueva_expiracion = fecha_expiracion_actual + 30 días.
    - Vencida:  nueva_expiracion = ahora + 30 días.
    - EXPIRADO → pasa a ACTIVO. RECHAZADO/DESACTIVADO conservan su estado.
    - Genera fila en publicaciones_audit con evento='RENEWED'.
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        datos = await repo.renovar_publicacion(db, pub_id, uid)
        return datos
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB] renovar_publicacion {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Mock fallback solo dev (sin PG)
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if pub.get("usuario_id") != uid:
        raise HTTPException(status_code=403, detail="No tienes permisos para renovar esta publicación.")

    now = datetime.now(timezone.utc)
    fecha_anterior = pub.get("fecha_expiracion") or now
    if isinstance(fecha_anterior, str):
        fecha_anterior = datetime.fromisoformat(fecha_anterior.replace("Z", "+00:00"))
    if getattr(fecha_anterior, "tzinfo", None) is None:
        fecha_anterior = fecha_anterior.replace(tzinfo=timezone.utc)

    if fecha_anterior > now:
        fecha_nueva = fecha_anterior + timedelta(days=30)
    else:
        fecha_nueva = now + timedelta(days=30)

    pub["fecha_expiracion"] = fecha_nueva
    pub["fecha_renovacion"] = now
    if pub.get("estado") == "EXPIRADO":
        pub["estado"] = "ACTIVO"

    return {
        "id": pub["id"],
        "estado": pub.get("estado", "ACTIVO"),
        "fecha_expiracion_anterior": fecha_anterior,
        "fecha_expiracion_nueva": fecha_nueva,
        "dias_agregados": 30,
        "mensaje": "La publicación fue renovada exitosamente.",
    }


@router.delete("/{pub_id}", status_code=status.HTTP_200_OK, summary="Dueño: eliminar aviso (democión N->0 si queda sin inventario)")
async def eliminar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v13.2: el dueño (o ADMIN) elimina su aviso.

    Misma transacción: DELETE + conteo de vigentes + democión a ESTUDIANTE
    si el inventario llega a 0 (row-lock anti-carreras). Responde el rol
    para que el frontend refresque sin re-login.
    401 sin token/id, 403 si no es dueño ni ADMIN, 404 si no existe.
    """
    from app.services import role_lifecycle as _rl
    uid_token = user.get("id")
    if not isinstance(uid_token, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar")
        dueno_id = p.usuario_id
        await db.delete(p)
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, dueno_id)
        await db.commit()
        return {"id": pub_id, "eliminada": True, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": "Publicación eliminada." + (
                    " Tu rol volvió a Usuario Base." if democionado else "")}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB fallback] eliminar {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _is_owner_or_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar")
    dueno_id = pub.get("usuario_id")
    MOCK_PUBS.remove(pub)
    # Espejo mock de la democión (mismo criterio de vigentes).
    democionado = False
    rol_final = user.get("rol")
    try:
        from app.routers.auth import MOCK_USERS as _MU
        restantes = sum(1 for x in MOCK_PUBS
                        if x.get("usuario_id") == dueno_id
                        and x.get("estado") in _rl.ESTADOS_VIGENTES)
        for _em, _m in _MU.items():
            if _m.get("id") == dueno_id and _m.get("rol") == "ARRENDADOR" and restantes == 0:
                _m["rol"] = "ESTUDIANTE"
                democionado = True
                rol_final = "ESTUDIANTE"
                break
    except Exception:
        pass
    return {"id": pub_id, "eliminada": True, "rol": rol_final,
            "rol_actualizado": democionado,
            "mensaje": "Publicación eliminada (mock)." + (
                " Tu rol volvió a Usuario Base." if democionado else "")}


@router.patch("/{pub_id}/estado", summary="Dueño: pausar/reanudar aviso (ACTIVO<->PAUSADO)")
async def cambiar_estado_dueno(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: dict = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v15.2 switch del arrendador. Solo dueño (o ADMIN).

    Allowlist: ACTIVO <-> PAUSADO y solo desde esos mismos estados (nunca
    desde PENDIENTE/RECHAZADO: eso eludiría la moderación -> 409).
    Misma transacción: estado + audit (PAUSED/RESUMED) + chequeo democión.
    """
    from app.services import role_lifecycle as _rl

    nuevo = (payload or {}).get("estado") if isinstance(payload, dict) else None
    if nuevo not in ("ACTIVO", "PAUSADO"):
        raise HTTPException(status_code=422, detail="estado debe ser ACTIVO o PAUSADO")
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion, PublicacionesAudit

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede cambiar el estado")
        if p.estado not in ("ACTIVO", "PAUSADO"):
            raise HTTPException(
                status_code=409,
                detail=f"No se puede cambiar estado desde {p.estado} (solo ACTIVO<->PAUSADO)",
            )
        if p.estado == nuevo:
            return {"id": p.id, "estado": p.estado, "rol": user.get("rol"),
                    "rol_actualizado": False, "mensaje": "Sin cambios."}
        p.estado = nuevo
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=uid,
            evento="PAUSED" if nuevo == "PAUSADO" else "RESUMED",
            detalle=f"Cambio a {nuevo} por el dueño",
        ))
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, p.usuario_id)
        await db.commit()
        return {"id": p.id, "estado": nuevo, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": f"Aviso {nuevo.lower()}."}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB fallback] estado {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _is_owner_or_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede cambiar el estado")
    if pub.get("estado") not in ("ACTIVO", "PAUSADO"):
        raise HTTPException(status_code=409, detail="Solo ACTIVO<->PAUSADO")
    pub["estado"] = nuevo
    return {"id": pub_id, "estado": nuevo, "rol": user.get("rol"),
            "rol_actualizado": False, "mensaje": f"Aviso {nuevo.lower()} (mock)."}


@router.get("/{pub_id}/historial", summary="Dueño: historial del aviso")
async def historial_aviso(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """M4 historial del inmueble: eventos del aviso (creada, pausada,
    aprobada...) en orden cronológico. Solo dueño o ADMIN (401/403/404).
    Sin PG en dev: lista vacía (el mock no persiste auditoría).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion, PublicacionesAudit

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede ver el historial")
        rows = (await db.execute(
            select(PublicacionesAudit).where(PublicacionesAudit.publicacion_id == pub_id)
            .order_by(PublicacionesAudit.id.asc()).limit(50)
        )).scalars().all()
        return {"id": pub_id, "items": [
            {"id": r.id, "evento": r.evento, "detalle": r.detalle,
             "creado_en": r.creado_en.isoformat() if r.creado_en else None}
            for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] historial {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return {"id": pub_id, "items": [], "mock": True}


@router.get("/{pub_id}/similares", summary="Inmuebles similares en la zona (excluye el actual)")
async def similares(
    pub_id: int = Path(..., ge=1, le=1000000),
    limit: int = Query(4, ge=1, le=12),
    db: AsyncSession = Depends(get_session),
):
    """v15.2 bloque 'similares': misma zona (o barrio libre), ACTIVO, dueño
    activo, ordenados por confianza desc. 404 si el aviso base no existe.

    Detalle #9: excluye avisos del propio dueño (usuario_id != base) — el
    bloque es "alternativas para descubrir", no "mis otros avisos".
    """
    try:
        from app.models import Publicacion

        base = await db.get(Publicacion, pub_id)
        if not base:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        from app.repositories.publicacion_repo import dueno_activo_clause
        from app.repositories import publicacion_repo as _repo
        from app.services import publicacion_view as _view
        conds = [
            Publicacion.id != pub_id,
            Publicacion.estado == "ACTIVO",
            dueno_activo_clause(Publicacion),
            Publicacion.usuario_id != base.usuario_id,
        ]
        if base.zona_barrio_id is not None:
            conds.append(Publicacion.zona_barrio_id == base.zona_barrio_id)
        elif base.barrio_texto:
            conds.append(Publicacion.barrio_texto == base.barrio_texto)
        else:
            return {"items": [], "total": 0}
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(*conds)
            .order_by(Publicacion.indice_confianza.desc(), Publicacion.id.asc())
            .limit(limit)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return {"items": [], "total": 0}
        rep_map, users_map, _ = await _repo.fetch_page_aggregates(db, pubs, None)
        mostrar = await _repo.vistas_publicas(db)
        return {"items": _view.cards_for_page(pubs, rep_map, users_map, {}, None, mostrar),
                "total": len(pubs)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] similares {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    base = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not base:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    # Detalle #9: también en mock se excluye al propio dueño.
    cands = [x for x in MOCK_PUBS
             if x["id"] != pub_id and x.get("estado") == "ACTIVO"
             and x.get("usuario_id") != base.get("usuario_id")
             and ((base.get("zona_barrio_id") is not None
                   and x.get("zona_barrio_id") == base.get("zona_barrio_id"))
                  or (base.get("zona_barrio_id") is None and base.get("barrio_texto")
                      and x.get("barrio_texto") == base.get("barrio_texto")))]
    items = [view.mock_to_out(x, None, False) for x in cands[:limit]]
    return {"items": items, "total": len(items)}


@router.post("/{pub_id}/vista", summary="Contar vista (dedup diaria por IP, anti-inflado)")
async def registrar_vista(
    pub_id: int = Path(..., ge=1, le=1000000),
    request: Request = ...,
    db: AsyncSession = Depends(get_session),
):
    """v15.2 métrica de vistas. Pública (ver vitrinas cuenta como visita).

    Antifraude: 1 conteo por (aviso, IP, día) vía hash SHA256 (nunca la IP
    en claro) + throttle 120/min por IP. Sin PG (dev mock): memoria local.
    """
    import hashlib as _hl
    from datetime import date as _date
    ip = "unknown"
    try:
        fwd = request.headers.get("x-forwarded-for") if request else None
        ip = (str(fwd).split(",")[0].strip() if fwd
              else (request.client.host if request and request.client else "unknown"))
    except Exception:
        pass
    await _db_rate_check_vista(db, ip)
    dia = _date.today().isoformat()
    marca = _hl.sha256(f"{ip}|{dia}".encode()).hexdigest()
    try:
        from app.models import Publicacion, VistaDedup

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        ya = (await db.execute(
            select(VistaDedup).where(VistaDedup.publicacion_id == pub_id,
                                     VistaDedup.marca == marca)
        )).scalars().first()
        if ya:
            return {"id": pub_id, "vistas": int(p.vistas or 0), "contada": False}
        db.add(VistaDedup(publicacion_id=pub_id, marca=marca, dia=dia))
        p.vistas = int(p.vistas or 0) + 1
        await db.commit()
        return {"id": pub_id, "vistas": int(p.vistas), "contada": True}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[DB vista] {pub_id} falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev: memoria local del proceso.
    key = (pub_id, marca)
    if key in _VISTAS_MOCK_SET:
        return {"id": pub_id, "vistas": 0, "contada": False, "mock": True}
    _VISTAS_MOCK_SET.add(key)
    for x in MOCK_PUBS:
        if x["id"] == pub_id:
            x["vistas"] = int(x.get("vistas", 0) or 0) + 1
            return {"id": pub_id, "vistas": int(x["vistas"]), "contada": True, "mock": True}
    raise HTTPException(status_code=404, detail="Publicación no encontrada")


async def _gate_escritura(db: AsyncSession, user: dict) -> tuple[dict, bool]:
    """Gate de escritura v13/v13.2/v14.1 (extraído de crear_publicacion).

    Verifica en orden (guard clauses): rol real de BD (anti-staleness del
    claim JWT) -> cuenta no eliminada -> email confirmado -> teléfono
    vinculado -> scope `publications:write` (con auto-promoción ESTUDIANTE).

    Args:
        db: Sesión async (misma transacción del endpoint).
        user: Claims JWT (requiere `id` int válido).

    Returns:
        Tupla (user_actualizado, rol_actualizado). `user` trae el rol real y
        sin claim `scopes` rancio; `rol_actualizado` indica promoción.

    Raises:
        HTTPException: 403 (soft-delete, email, scope), 400 (sin teléfono).
    """
    from app.core.permissions import has_scope as _has_scope
    from app.services import role_lifecycle as _rl

    rol_actualizado = False
    rol_bd, email_ok_bd, tel_bd = user.get("rol"), None, None
    _uu = None
    rol_verificado = False
    try:
        from app.models import Usuario as _U
        _ures = await db.execute(select(_U).where(_U.id == user["id"]))
        _uu = _ures.scalars().first()
        if _uu is not None:
            rol_bd = _uu.rol
            email_ok_bd = bool(getattr(_uu, "email_verificado", True))
            tel_bd = getattr(_uu, "telefono_whatsapp", None)
            rol_verificado = True
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
    if not rol_verificado and _mock_enabled():
        # Fuente de verdad en mock: MOCK_USERS (los claims del mock-token
        # legacy pueden venir sin teléfono).
        try:
            from app.routers.auth import MOCK_USERS as _MU
            _m = None
            for _em, _mm in _MU.items():
                if _mm.get("id") == user.get("id"):
                    _m = _mm
                    break
            if _m is None:
                from app.routers.auth import _norm_email as _ne
                _m = _MU.get(_ne(user.get("sub") or ""))
            if _m is not None:
                rol_bd = _m.get("rol") or rol_bd
                email_ok_bd = bool(_m.get("email_verificado", True))
                tel_bd = _m.get("telefono_whatsapp")
                rol_verificado = True
        except Exception:
            pass
    user = {**user, "rol": rol_bd or user.get("rol")}
    if _uu is not None and getattr(_uu, "eliminado_en", None) is not None:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta está en proceso de eliminación. Restáurala antes de publicar.",
        )
    if rol_verificado:
        # Anti-staleness: sin claim, los scopes derivan del rol real.
        user.pop("scopes", None)
    if not user.get("email_verificado") and email_ok_bd is False:
        raise HTTPException(
            status_code=403,
            detail="Confirma tu correo antes de publicar (revisa tu email o solicita un código en /api/auth/otp/solicitar)",
        )
    tel_efectivo = tel_bd or user.get("telefono_whatsapp")
    if not tel_efectivo:
        raise HTTPException(
            status_code=400,
            detail="Vincula un número de contacto antes de publicar (Mi Perfil → Datos y contacto)",
        )
    if not _has_scope(user, "publications:write"):
        promovido = False
        if user.get("rol") == "ESTUDIANTE":
            try:
                rol_final = await _rl.promover_si_estudiante(db, user["id"])
                if rol_final == "ARRENDADOR":
                    user = {**user, "rol": "ARRENDADOR"}
                    user.pop("scopes", None)
                    promovido = True
                    rol_actualizado = True
            except Exception:
                pass
            if not promovido and _mock_enabled():
                from app.routers.auth import MOCK_USERS as _MU
                for _em, _m in _MU.items():
                    if _m.get("id") == user.get("id") and _m.get("rol") == "ESTUDIANTE":
                        _m["rol"] = "ARRENDADOR"
                        user = {**user, "rol": "ARRENDADOR"}
                        user.pop("scopes", None)
                        promovido = True
                        rol_actualizado = True
                        break
        if not _has_scope(user, "publications:write"):
            raise HTTPException(status_code=403, detail="Solo ARRENDADOR puede publicar (se requiere 'publications:write')")
    return user, rol_actualizado


@router.post("", response_model=PublicacionCreatedOut, status_code=status.HTTP_201_CREATED, summary="HU-005 Publicar oferta estructurada -> PENDIENTE (auto-promueve ESTUDIANTE)")
async def crear_publicacion(
    payload: PublicacionCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    HU-005 Criterios:
      1. Título, tipo, canon, zona, servicios y fotos obligatorios (validado por PublicacionCreate)
      2. ≥3 fotos (Sprint1 adopta 3 para índice, aunque plantilla HU-005 decía 2)
      3. Estado inicial PENDIENTE (no ACTIVO directo; requiere moderación HU-010 Sprint2)

    v13:
      - RBAC por scopes: exige `publications:write`. Un ESTUDIANTE que
        publica se promueve automáticamente a ARRENDADOR (sin duplicar
        cuentas) y la petición continúa.
      - Email no confirmado bloquea la escritura (403 con guía a /otp).
    v13.2:
      - El rol se verifica contra BD (no solo el claim del JWT: evita que
        un token democionado conserve scopes hasta expirar).
      - Sin teléfono vinculado -> 400 (progressive profiling: se exige al
        publicar, no al registrarse). La promoción solo ocurre si email +
        teléfono están listos.
      - La respuesta incluye `rol` + `rol_actualizado` para que el frontend
        refresque el perfil sin re-login.

    Args:
        payload: Oferta validada por PublicacionCreate.
        user: Claims JWT (inyectados por get_current_user, con revocación).
        db: Sesión async (misma transacción para gate + persistencia).

    Returns:
        PublicacionCreatedOut con `rol`/`rol_actualizado` para reactividad.

    Raises:
        HTTPException: 401 sin propietario válido, 403 sin email/scope o
            cuenta en eliminación, 400 sin teléfono, 404 FK, 503 sin BD.
    """
    # Guard: nunca suplantar dueño (F1) antes de tocar la BD.
    if not isinstance(user.get("id"), int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    # Gate v13/v13.2/v14.1 (rol real + email + teléfono + promoción).
    user, rol_actualizado = await _gate_escritura(db, user)
    # M2: valida tipo contra housing_types (esta_activo=true, caché 5min).
    try:
        from app.services import housing_types as _ht
        activos = await _ht.slugs_activos(db)
        if payload.tipo_inmueble not in activos:
            raise HTTPException(status_code=422, detail=f"tipo_inmueble '{payload.tipo_inmueble}' no válido o inactivo")
    except HTTPException:
        raise
    except Exception:
        pass
    # Calcular índice inicial (default telefono_verificado False si ausente).
    trust = view.initial_trust(payload, bool(user.get("telefono_verificado", False)))

    # Intentar persistir en DB
    try:
        # F1: token sin id entero válido -> 401 (nunca suplantar dueño id=1).
        if not isinstance(user.get("id"), int):
            raise HTTPException(status_code=401, detail="Token sin propietario válido")
        campus_ids, servicios_ids = await repo.validate_fks(
            db, payload.zona_barrio_id, payload.campus_ids, payload.servicios_ids
        )
        nueva = await repo.create_persisted(db, payload, user["id"], trust, campus_ids, servicios_ids)
        # v15.2 auto-moderación (flag OFF por defecto: no-op, sigue PENDIENTE).
        mod_info = None
        try:
            from app.services import auto_moderation as _am
            _res = await _am.evaluar_y_aplicar(db, nueva)
            await db.commit()
            await db.refresh(nueva)
            if _res.labels.get("auto", True) is not False and _res.decision == _am.APPROVE:
                mod_info = _res.to_dict()
        except Exception as _e:
            logger.warning(f"[automod] no aplicada, sigue flujo manual: {_e!r}")
        return {"id": nueva.id, "estado": nueva.estado, "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"], "mensaje": "Publicación en PENDIENTE, pendiente de moderación" if nueva.estado == "PENDIENTE" else "Publicación aprobada automáticamente", "rol": user.get("rol"), "rol_actualizado": rol_actualizado, "moderacion": mod_info}

    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[DB crear] falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        # Mock fallback Sprint1 solo dev: no hay PG, simular creación (usa id 10000+ para no colisionar con ids del seed)
        mock_id = max(max(p["id"] for p in MOCK_PUBS), 10000) + 1
        MOCK_PUBS.append({
            "id": mock_id, "titulo": payload.titulo, "descripcion": payload.descripcion,
            "tipo_inmueble": payload.tipo_inmueble, "canon_mensual": float(payload.canon_mensual),
            "deposito_requerido": float(payload.deposito_requerido), "zona_barrio_id": payload.zona_barrio_id,
            "barrio_texto": payload.barrio_texto,
            "direccion_referencial": payload.direccion_referencial, "reglas_convivencia": payload.reglas_convivencia,
            "estado": "PENDIENTE", "fecha_renovacion": datetime.now(timezone.utc),
            "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=30),
            "servicios_ids": list(dict.fromkeys(payload.servicios_ids)), "servicios": [],
            "fotos": [str(u) for u in payload.fotos], "latitud": payload.latitud, "longitud": payload.longitud,
            "campus_ids": list(dict.fromkeys(payload.campus_ids)), "usuario_id": user["id"],
            "telefono_verificado": bool(user.get("telefono_verificado", False)), "reportes_activos": 0,
        })
        return {"id": mock_id, "estado": "PENDIENTE (MOCK - sin PG)", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"], "detalle_mock": f"DB no disponible ({e}), se usó mock en memoria", "rol": user.get("rol"), "rol_actualizado": rol_actualizado}
