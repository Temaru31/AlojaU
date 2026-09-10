"""
routers/publicaciones.py - HU-001,002,003,005,007 (Sprint1) + Mis publicaciones (UX)
Endpoints:
  GET  /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
  GET  /api/publicaciones/mias                                                (UX: dueño, todos los estados)
  GET  /api/publicaciones/{id}                                                (HU-003+007)
  POST /api/publicaciones                                                      (HU-005 -> PENDIENTE, solo ARRENDADOR)

Sprint1: mock lista en memoria si no hay PG (frontend no se bloquea). Si hay PG, query real con Haversine + TrustScoreEngine.
NFR P95<500ms: query indexada (estado, zona, canon), sin N+1, Haversine en memoria/Python.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status, Header
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.config import settings
from app.core.security import get_current_user, get_optional_user, require_arrendador
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import (
    PublicacionCreate,
    PublicacionCreatedOut,
    PublicacionCardOut,
    PublicacionDetailOut,
    PublicacionUpdate,
    PaginatedPublicaciones,
)
from app.core.pagination import paginate_params, build_paginated
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
@router.get("", response_model=PaginatedPublicaciones, summary="HU-001 Buscar por sede + HU-002 Filtros combinables")
async def list_publicaciones(
    campus_id: Optional[int] = Query(None, ge=1, le=1000, description="FK campus_universitarios.id - calcula Haversine y filtra publicaciones asociadas"),
    precio_min: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP máximo"),
    tipo: Optional[str] = Query(None, pattern="^(HABITACION_FAMILIAR|HABITACION_INDEPENDIENTE|APARTAESTUDIO|COMPARTIDO)$"),
    servicios: Optional[str] = Query(None, max_length=50, description="IDs coma separados, ej: 1,3"),
    q: Optional[str] = Query(None, min_length=2, max_length=100, description="Texto libre: FTS español + fallback trigramas (Oleada 2)"),
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

    servicios_ids = view.parse_servicios_param(servicios)

    # Intento DB real con fallback mock solo en dev (B0-2 fail-closed 503 en prod)
    try:
        total, pubs, rep_map, user_map, dist_map, size_norm = await repo.query_lista(
            db, campus_id, precio_min, precio_max, tipo, servicios_ids, page, size, q
        )
        items = view.cards_for_page(pubs, rep_map, user_map, dist_map, campus_id)
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
        print(f"[Sprint1 mock fallback] DB no disponible: {e!r}")
        filtradas = view.filter_mock_pubs(MOCK_PUBS, campus_id, precio_min, precio_max, tipo, servicios_ids, q)
        items = [view.mock_to_out(p, campus_id) for p in filtradas]
        total = len(items)
        offset, size_norm = paginate_params(page, size)
        paginated_items = items[offset:offset+size_norm]
        return build_paginated(paginated_items, total, page, size_norm)

@router.get("/mias", response_model=PaginatedPublicaciones, summary="UX Mis publicaciones del dueño (todos los estados, paginado)")
async def mis_publicaciones(
    estado: Optional[str] = Query(None, pattern="^(ACTIVO|PENDIENTE|PAUSADO|RECHAZADO|ARRENDADO|EXPIRADO|DESACTIVADO)$", description="Filtra por estado (default todos)"),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(12, ge=1, le=50, description="Tamaño página"),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Lista las publicaciones del usuario autenticado en TODOS los estados
    (ACTIVO + PENDIENTE en moderación + otros), más recientes primero, paginado.
    Sin token -> 401. Cada dueño solo ve las suyas (filtro usuario_id).
    NOTA: declarada ANTES de /{pub_id} para que "mias" no caiga en el path param."""
    uid = user.get("id")
    # F1: token sin id entero válido -> 401 (nunca filtrar por dueño ajeno).
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion

        conds = [Publicacion.usuario_id == uid]
        if estado:
            conds.append(Publicacion.estado == estado)
        total_stmt = select(func.count()).select_from(Publicacion).where(*conds)
        total = (await db.execute(total_stmt)).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(*conds)
            .order_by(Publicacion.id.desc())
            .limit(size_norm)
            .offset(offset)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return build_paginated([], total, page, size_norm)
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, pubs, None)
        return build_paginated(view.cards_for_page(pubs, rep_map, users_map, {}, None), total, page, size_norm)
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
    filtradas = [p for p in MOCK_PUBS if p.get("usuario_id") == uid]
    if estado:
        filtradas = [p for p in filtradas if p.get("estado") == estado]
    filtradas.sort(key=lambda p: p["id"], reverse=True)
    total = len(filtradas)
    offset, size_norm = paginate_params(page, size)
    items = [view.mock_to_out(p) for p in filtradas[offset:offset + size_norm]]
    return build_paginated(items, total, page, size_norm)

@router.get("/{pub_id}", response_model=PublicacionDetailOut, summary="HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp")
async def get_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    HU-003: muestra canon, servicios, fotos, zona, condiciones, vigencia
            No expone datos que no deban ser públicos (email propietario, etc)
    HU-007: incluye indice_confianza 0-100 + desglose 40+20+15+15+10 + disclaimer
    HU-008: telefono_whatsapp solo si verificado + whatsapp_url wa.me
    B0-6: PENDIENTE (y no-ACTIVO) privado -> 404 salvo owner/admin.
    """
    current_user = get_optional_user(authorization)
    try:
        p, reportes_activos, u, dist_detalle = await repo.fetch_detail_bundle(db, pub_id)
        if p:
            # B0-6: detalle no-ACTIVO privado (404 para no filtrar existencia).
            if p.estado != "ACTIVO" and not _is_owner_or_admin(current_user, p.usuario_id):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            return view.build_detail(p, reportes_activos, u, dist_detalle)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] get_publicacion {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        print(f"[DB fallback] get_publicacion {pub_id}: {e!r}")

    # Mock fallback solo dev (B0-2). B0-6: no-ACTIVO privado también en mock.
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((p for p in MOCK_PUBS if p["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if pub.get("estado") != "ACTIVO" and not _is_owner_or_admin(current_user, pub.get("usuario_id")):
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return view.mock_to_out(pub)

@router.patch("/{pub_id}", response_model=PublicacionCardOut, summary="UX Editar aviso del dueño (solo owner/ADMIN)")
async def editar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: PublicacionUpdate = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Edición parcial del dueño: titulo/descripcion/tipo/canon/deposito/direccion/reglas.
    401 sin token o sin id válido, 403 si no es dueño ni ADMIN, 404 si no existe,
    422 si algún campo viola cotas (iguales a Create) o el body viene vacío.
    El estado NO cambia (re-moderación llega en T2; cambiarlo aquí sin bandeja
    escondería el aviso sin forma de re-aprobar). Sin fila de audit: el CHECK de
    publicaciones_audit no tiene evento EDITED (migración pendiente en T2)."""
    cambios = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _is_owner_or_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar")
        for k, v in cambios.items():
            setattr(p, k, v)
        await db.commit()
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
        return view.cards_for_page([p], rep_map, users_map, {}, None)[0]
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
    pub.update(cambios)
    return view.mock_to_out(pub)

@router.post("", response_model=PublicacionCreatedOut, status_code=status.HTTP_201_CREATED, summary="HU-005 Publicar oferta estructurada -> PENDIENTE (solo ARRENDADOR)")
async def crear_publicacion(
    payload: PublicacionCreate,
    user: dict = Depends(require_arrendador),
    db: AsyncSession = Depends(get_session),
):
    """
    HU-005 Criterios:
      1. Título, tipo, canon, zona, servicios, sede ref y fotos obligatorios (validado por PublicacionCreate)
      2. ≥3 fotos (Sprint1 adopta 3 para índice, aunque plantilla HU-005 decía 2)
      3. Estado inicial PENDIENTE (no ACTIVO directo; requiere moderación HU-010 Sprint2)

    Sprint1: si no hay DB, retorna mock PENDIENTE + calcula índice inicial (no persiste) para demo frontend.
    Con DB: persiste publicación + publicacion_campus (con Haversine) + imagenes + calcula índice.
    B0-4: FK estricta zona/campus/servicios -> 404 con rollback. B0-5: dist NULL si sin coords.
    """
    # Validación extra: si lat/lng no provistas, warning pero no bloquea (Sprint1)
    # Calcular índice inicial (B0-6: default telefono_verificado False si ausente).
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
        return {"id": nueva.id, "estado": "PENDIENTE", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"], "mensaje": "Publicación en PENDIENTE, pendiente de moderación"}

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
        # Mock fallback Sprint1 solo dev: no hay PG, simular creación (usa id 10000+ para no colisionar con DB ids 1-6)
        mock_id = max(max(p["id"] for p in MOCK_PUBS), 10000) + 1
        MOCK_PUBS.append({
            "id": mock_id, "titulo": payload.titulo, "descripcion": payload.descripcion,
            "tipo_inmueble": payload.tipo_inmueble, "canon_mensual": float(payload.canon_mensual),
            "deposito_requerido": float(payload.deposito_requerido), "zona_barrio_id": payload.zona_barrio_id,
            "direccion_referencial": payload.direccion_referencial, "reglas_convivencia": payload.reglas_convivencia,
            "estado": "PENDIENTE", "fecha_renovacion": datetime.now(timezone.utc),
            "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=30),
            "servicios_ids": list(dict.fromkeys(payload.servicios_ids)), "servicios": [],
            "fotos": [str(u) for u in payload.fotos], "latitud": payload.latitud, "longitud": payload.longitud,
            "campus_ids": list(dict.fromkeys(payload.campus_ids)), "usuario_id": user["id"],
            "telefono_verificado": bool(user.get("telefono_verificado", False)), "reportes_activos": 0,
        })
        return {"id": mock_id, "estado": "PENDIENTE (MOCK - sin PG)", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"], "detalle_mock": f"DB no disponible ({e}), se usó mock en memoria"}
