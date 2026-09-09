"""
routers/publicaciones.py - HU-001,002,003,005,007 (Sprint1)
Endpoints:
  GET  /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
  GET  /api/publicaciones/{id}                                                (HU-003+007)
  POST /api/publicaciones                                                      (HU-005 -> PENDIENTE, solo ARRENDADOR)

Sprint1: mock lista en memoria si no hay PG (frontend no se bloquea). Si hay PG, query real con Haversine + TrustScoreEngine.
NFR P95<500ms: query indexada (estado, zona, canon), sin N+1, Haversine en memoria/Python.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from urllib.parse import quote as urlquote
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.core.config import settings
from app.core.security import get_optional_user, require_arrendador
from app.schemas.publicacion import (
    PublicacionCreate,
    PublicacionCardOut,
    PublicacionDetailOut,
    PublicacionCreatedOut,
    PaginatedPublicaciones,
)
from app.services.haversine import haversine_m
from app.services.trust import calcular_indice, dias_desde, DISCLAIMER
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

# --- MOCK Sprint1 (si no hay PG) ---
# Datos coherentes con main.py legacy + HU-007 desglose + distancia Haversine
MOCK_CAMPUS = {
    1: {"id": 1, "institucion": "Universidad del Cauca", "nombre_sede": "Campus Tulcán", "lat": 2.443, "lng": -76.606},
    2: {"id": 2, "institucion": "Unicomfacauca", "nombre_sede": "Claustro", "lat": 2.441, "lng": -76.606},
}
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

def _to_out(pub: dict, campus_id: Optional[int] = None) -> dict:
    """Convierte dict mock/DB a PublicacionOut payload (incluye Haversine + Trust)"""
    # Haversine si campus_id
    dist = None
    if campus_id and campus_id in MOCK_CAMPUS and pub.get("latitud") is not None and pub.get("longitud") is not None:
        c = MOCK_CAMPUS[campus_id]
        dist = haversine_m(pub["latitud"], pub["longitud"], c["lat"], c["lng"])

    # TrustScoreEngine
    dias_vig = dias_desde(pub.get("fecha_renovacion"))
    trust = calcular_indice(
        canon_mensual=pub.get("canon_mensual"),
        deposito_requerido=pub.get("deposito_requerido"),
        tipo_inmueble=pub.get("tipo_inmueble"),
        reglas_convivencia=pub.get("reglas_convivencia"),
        direccion_referencial=pub.get("direccion_referencial"),
        servicios_ids=pub.get("servicios_ids"),
        telefono_verificado=pub.get("telefono_verificado", False),
        num_fotos=len(pub.get("fotos", [])),
        dias_vigencia=dias_vig,
        reportes_activos=pub.get("reportes_activos", 0),
    )
    fotos = pub.get("fotos", [])
    # HU-008: wa.me solo si verificado, si no None (frontend muestra alerta)
    tel = pub.get("telefono_whatsapp") if pub.get("telefono_verificado") else None
    wa_url = f"https://wa.me/{tel}?text=Hola%2C%20vi%20{pub['titulo']}%20(ID%20{pub['id']})%20en%20AlojaU" if tel else None

    return {
        "id": pub["id"],
        "titulo": pub["titulo"],
        "descripcion": pub.get("descripcion"),
        "tipo_inmueble": pub["tipo_inmueble"],
        "canon_mensual": pub["canon_mensual"],
        "canon": pub["canon_mensual"],  # F1 alias compat explícito
        "deposito": pub.get("deposito_requerido", 0),  # F1 alias compat
        "deposito_requerido": pub.get("deposito_requerido", 0),
        "zona_barrio_id": pub["zona_barrio_id"],
        "zona": pub.get("zona_nombre"),  # F1 alias compat
        "zona_nombre": pub.get("zona_nombre"),
        "direccion_referencial": pub["direccion_referencial"],
        "reglas": pub.get("reglas_convivencia"),  # F1 alias compat
        "reglas_convivencia": pub.get("reglas_convivencia"),
        "estado": pub["estado"],
        "fecha_publicacion": pub.get("fecha_publicacion"),
        "fecha_renovacion": pub.get("fecha_renovacion"),
        "fecha_expiracion": pub.get("fecha_expiracion"),
        "servicios": pub.get("servicios", []),
        "servicios_ids": pub.get("servicios_ids", []),
        "fotos": fotos,
        "num_fotos": len(fotos),
        "distancia_geodesica_m": dist,
        "dist_m": dist,  # F1 alias compat
        "campus_distancias": [{"campus_id": cid, "dist_m": haversine_m(pub["latitud"], pub["longitud"], MOCK_CAMPUS[cid]["lat"], MOCK_CAMPUS[cid]["lng"])} for cid in pub.get("campus_ids", []) if cid in MOCK_CAMPUS and pub.get("latitud") is not None] if pub.get("latitud") is not None else None,
        "indice_confianza": trust["indice"],
        "indice": trust["indice"],  # F1 alias compat
        "desglose": trust["desglose"],
        "nivel": trust["nivel"],  # F1 alias compat
        "nivel_confianza": trust["nivel"],
        "advertencia": trust["advertencia"],  # F1 alias compat
        "advertencia_confianza": trust["advertencia"],
        "telefono_whatsapp": tel,
        "whatsapp_url": wa_url,
        "usuario_id": pub.get("usuario_id"),
    }

# --- Helpers DB real (si PG disponible) ---
def _lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios):
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


async def _query_db_lista(
    db: AsyncSession,
    campus_id: Optional[int],
    precio_min: Optional[int],
    precio_max: Optional[int],
    tipo: Optional[str],
    servicios: Optional[List[int]],
    page: int = 1,
    size: int = 9,
):
    """
    Sprint1 real DB: SELECT + JOIN publicacion_campus + cálculo distancia.
    Si campus_id, ordenar por distancia (Haversine precalculado en publicacion_campus.distancia_geodesica_m)
    Filtros combinables (HU-002 C1-3).
    Paginación: page 1-indexed, size 1-50.
    """
    # Lazy import para evitar ciclo
    from app.models import Publicacion, PublicacionCampus, Usuario, ReportePublicacion
    from sqlalchemy import func

    conds = _lista_conditions(Publicacion, campus_id, precio_min, precio_max, tipo, servicios)
    offset, size_norm = paginate_params(page, size)

    # COUNT total en SQL (portable PG/SQLite: COUNT DISTINCT, sin traer filas).
    count_stmt = select(func.count(func.distinct(Publicacion.id))).where(*conds)
    if campus_id:
        count_stmt = count_stmt.join(
            PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id
        ).where(PublicacionCampus.campus_id == campus_id)
    total = (await db.execute(count_stmt)).scalar() or 0
    if total == 0:
        return build_paginated([], 0, page, size_norm)

    # Página en SQL: LIMIT/OFFSET + orden determinista (distancia NULLS LAST + id).
    page_stmt = (
        select(Publicacion)
        .options(selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios))
        .where(*conds)
    )
    if campus_id:
        page_stmt = (
            page_stmt.join(PublicacionCampus, PublicacionCampus.publicacion_id == Publicacion.id)
            .where(PublicacionCampus.campus_id == campus_id)
            .order_by(PublicacionCampus.distancia_geodesica_m.asc().nullslast(), Publicacion.id.asc())
        )
    else:
        page_stmt = page_stmt.order_by(Publicacion.id.asc())
    page_stmt = page_stmt.limit(size_norm).offset(offset)
    pubs = (await db.execute(page_stmt)).scalars().unique().all()

    # Agregados en lote para la página (3 queries fijas, sin N+1).
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

    # Mapear a dict para Trust (usa agregados en memoria, sin queries por aviso).
    out = []
    for p in pubs:
        reportes_activos = reportes_map.get(p.id, 0)
        u = users_map.get(p.usuario_id)
        tel_ver = bool(u.telefono_verificado) if u else False
        dist = dist_map.get(p.id) if campus_id else None

        dias_vig = dias_desde(p.fecha_renovacion)
        trust = calcular_indice(
            canon_mensual=float(p.canon_mensual), deposito_requerido=float(p.deposito_requerido),
            tipo_inmueble=p.tipo_inmueble, reglas_convivencia=p.reglas_convivencia,
            direccion_referencial=p.direccion_referencial, servicios_ids=[s.id for s in p.servicios],
            telefono_verificado=tel_ver, num_fotos=len(p.imagenes), dias_vigencia=dias_vig, reportes_activos=reportes_activos
        )
        # zona nombre via relationship (lazy joined)
        zona_nombre = p.zona.nombre if hasattr(p, 'zona') and p.zona else None
        # construir out (simplificado)
        out.append({
            "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
            "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual), "deposito_requerido": float(p.deposito_requerido),
            "zona_barrio_id": p.zona_barrio_id, "zona": zona_nombre, "zona_nombre": zona_nombre, "direccion_referencial": p.direccion_referencial,
            "reglas_convivencia": p.reglas_convivencia, "estado": p.estado,
            "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
            "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios],
            "fotos": [im.url for im in p.imagenes], "num_fotos": len(p.imagenes),
            "distancia_geodesica_m": dist, "dist_m": dist,
            "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"], "nivel_confianza": trust["nivel"], "nivel": trust["nivel"],
            "telefono_whatsapp": u.telefono_whatsapp if tel_ver and u else None,
            "usuario_id": p.usuario_id,
        })
    return build_paginated(out, total, page, size_norm)

# --- Endpoints Sprint1 ---
@router.get("", response_model=PaginatedPublicaciones, summary="HU-001 Buscar por sede + HU-002 Filtros combinables")
async def list_publicaciones(
    campus_id: Optional[int] = Query(None, ge=1, le=1000, description="FK campus_universitarios.id - calcula Haversine y filtra publicaciones asociadas"),
    precio_min: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP máximo"),
    tipo: Optional[str] = Query(None, pattern="^(HABITACION_FAMILIAR|HABITACION_INDEPENDIENTE|APARTAESTUDIO|COMPARTIDO)$"),
    servicios: Optional[str] = Query(None, max_length=50, description="IDs coma separados, ej: 1,3"),
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

    servicios_ids = None
    if servicios:
        if len(servicios) > 50:
            raise HTTPException(status_code=400, detail="servicios parámetro demasiado largo")
        try:
            servicios_ids = [int(s.strip()) for s in servicios.split(",") if s.strip()]
            if len(servicios_ids) > 10:
                raise HTTPException(status_code=400, detail="máximo 10 servicios")
            for sid in servicios_ids:
                if sid < 1 or sid > 1000:
                    raise HTTPException(status_code=400, detail=f"servicio_id {sid} fuera de rango")
        except ValueError:
            raise HTTPException(status_code=400, detail="servicios debe ser lista de ints coma separada")

    # Intento DB real con fallback mock solo en dev (B0-2 fail-closed 503 en prod)
    try:
        paginated = await _query_db_lista(db, campus_id, precio_min, precio_max, tipo, servicios_ids, page, size)
        return paginated
    except HTTPException:
        raise
    except Exception as e:
        # Log real para diagnóstico en Render (no ocultar excepción)
        logger.error(f"[DB fallback] _query_db_lista falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        print(f"[Sprint1 mock fallback] DB no disponible: {e!r}")
        filtradas = [p for p in MOCK_PUBS if p["estado"] == "ACTIVO"]

        if campus_id:
            filtradas = [p for p in filtradas if campus_id in p.get("campus_ids", [])]
            filtradas.sort(key=lambda p: haversine_m(p["latitud"], p["longitud"], MOCK_CAMPUS[campus_id]["lat"], MOCK_CAMPUS[campus_id]["lng"]) if p.get("latitud") is not None and p.get("longitud") is not None else 999999)

        if precio_min is not None:
            filtradas = [p for p in filtradas if p["canon_mensual"] >= precio_min]
        if precio_max is not None:
            filtradas = [p for p in filtradas if p["canon_mensual"] <= precio_max]
        if tipo:
            filtradas = [p for p in filtradas if p["tipo_inmueble"] == tipo]
        if servicios_ids:
            filtradas = [p for p in filtradas if all(s in p.get("servicios_ids", []) for s in servicios_ids)]

        items = [_to_out(p, campus_id) for p in filtradas]
        total = len(items)
        offset, size_norm = paginate_params(page, size)
        paginated_items = items[offset:offset+size_norm]
        return build_paginated(paginated_items, total, page, size_norm)

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
        from app.models import Publicacion, ReportePublicacion, Usuario
        from sqlalchemy import func, select as sel
        p = await db.get(Publicacion, pub_id, options=[selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios)])
        if p:
            # B0-6: detalle no-ACTIVO privado (404 para no filtrar existencia).
            if p.estado != "ACTIVO" and not _is_owner_or_admin(current_user, p.usuario_id):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            # Trust real
            r = await db.execute(sel(func.count()).select_from(ReportePublicacion).where(ReportePublicacion.publicacion_id==p.id, ReportePublicacion.estado.in_(["PENDIENTE","CONFIRMADO"])))
            reportes_activos = r.scalar() or 0
            u = await db.get(Usuario, p.usuario_id)
            tel_ver = bool(u.telefono_verificado) if u else False
            trust = calcular_indice(
                canon_mensual=float(p.canon_mensual), deposito_requerido=float(p.deposito_requerido),
                tipo_inmueble=p.tipo_inmueble, reglas_convivencia=p.reglas_convivencia,
                direccion_referencial=p.direccion_referencial, servicios_ids=[s.id for s in p.servicios],
                telefono_verificado=tel_ver, num_fotos=len(p.imagenes), dias_vigencia=dias_desde(p.fecha_renovacion), reportes_activos=reportes_activos
            )
            fotos = [im.url for im in p.imagenes]
            tel = u.telefono_whatsapp if tel_ver and u else None
            wa = f"https://wa.me/{tel}?text={urlquote(f'Hola, vi {p.titulo} (ID {p.id}) en AlojaU y me interesa.')}" if tel else None
            zona_nombre = p.zona.nombre if hasattr(p, 'zona') and p.zona else "No informado"
            # distancia en detalle: si no hay campus_id, mostrar la más cercana
            from app.models import PublicacionCampus as PC
            # buscar distancia mínima si no hay una específica
            pc_min = await db.execute(sel(PC).where(PC.publicacion_id==p.id).order_by(PC.distancia_geodesica_m))
            pc_min = pc_min.scalars().first()
            dist_detalle = pc_min.distancia_geodesica_m if pc_min else None
            return {
                "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
                "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
                "deposito": float(p.deposito_requerido), "deposito_requerido": float(p.deposito_requerido),
                "zona_barrio_id": p.zona_barrio_id, "zona": zona_nombre, "zona_nombre": zona_nombre,
                "direccion_referencial": p.direccion_referencial, "reglas": p.reglas_convivencia, "reglas_convivencia": p.reglas_convivencia,
                "estado": p.estado, "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
                "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios], "fotos": fotos, "num_fotos": len(fotos),
                "distancia_geodesica_m": dist_detalle, "dist_m": dist_detalle,
                "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"], "nivel": trust["nivel"],
                "nivel_confianza": trust["nivel"],
                "advertencia": trust["advertencia"], "telefono_whatsapp": tel, "whatsapp_url": wa,
            }
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
    return _to_out(pub)

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
    trust = calcular_indice(
        canon_mensual=float(payload.canon_mensual),
        deposito_requerido=float(payload.deposito_requerido),
        tipo_inmueble=payload.tipo_inmueble,
        reglas_convivencia=payload.reglas_convivencia,
        direccion_referencial=payload.direccion_referencial,
        servicios_ids=payload.servicios_ids,
        telefono_verificado=bool(user.get("telefono_verificado", False)),
        num_fotos=len(payload.fotos),
        dias_vigencia=0,  # recién creada
        reportes_activos=0,
    )

    # Intentar persistir en DB
    try:
        from app.models import (
            Publicacion, PublicacionCampus, ImagenPublicacion, PublicacionServicio,
            PublicacionesAudit as PublicacionAudit, ZonaBarrio, CampusUniversitario,
            ServicioCatalogo,
        )
        # F1: token sin id entero válido -> 401 (nunca suplantar dueño id=1).
        if not isinstance(user.get("id"), int):
            raise HTTPException(status_code=401, detail="Token sin propietario válido")
        # F1: dedup ids (evita PK violation 500 por duplicados).
        campus_ids = list(dict.fromkeys(payload.campus_ids))
        servicios_ids = list(dict.fromkeys(payload.servicios_ids))
        # B0-4 FK estricta: 404 si zona/campus/servicio inexistente (antes de flush).
        zona = await db.get(ZonaBarrio, payload.zona_barrio_id)
        if not zona:
            raise HTTPException(status_code=404, detail=f"zona_barrio_id {payload.zona_barrio_id} no existe")
        for cid in campus_ids:
            campus = await db.get(CampusUniversitario, cid)
            if not campus or not campus.activo:
                raise HTTPException(status_code=404, detail=f"campus_id {cid} no existe o inactivo")
        for sid in servicios_ids:
            if not await db.get(ServicioCatalogo, sid):
                raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
        # Crear publicación
        nueva = Publicacion(
            usuario_id=user["id"],
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
        await db.flush()  # obtiene id

        # Relaciones N:M campus (Haversine real desde DB; B0-5 dist NULL si sin coords)
        for cid in campus_ids:
            dist = None
            if payload.latitud is not None and payload.longitud is not None:
                campus = await db.get(CampusUniversitario, cid)
                if campus is not None and campus.latitud is not None and campus.longitud is not None:
                    dist = haversine_m(float(payload.latitud), float(payload.longitud), float(campus.latitud), float(campus.longitud))
            db.add(PublicacionCampus(publicacion_id=nueva.id, campus_id=cid, distancia_geodesica_m=dist))

        for sid in servicios_ids:
            db.add(PublicacionServicio(publicacion_id=nueva.id, servicio_id=sid))

        for idx, url in enumerate(payload.fotos, start=1):
            db.add(ImagenPublicacion(publicacion_id=nueva.id, url=str(url), orden=idx))

        db.add(PublicacionAudit(publicacion_id=nueva.id, usuario_id=nueva.usuario_id, evento="CREATED", detalle="PENDIENTE"))

        await db.commit()
        await db.refresh(nueva)
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
        nueva_mock = {
            "id": mock_id, "titulo": payload.titulo, "tipo_inmueble": payload.tipo_inmueble,
            "canon_mensual": float(payload.canon_mensual), "estado": "PENDIENTE",
            "fotos": [str(u) for u in payload.fotos],
        }
        MOCK_PUBS.append({
            "id": mock_id, "titulo": payload.titulo, "descripcion": payload.descripcion,
            "tipo_inmueble": payload.tipo_inmueble, "canon_mensual": float(payload.canon_mensual),
            "deposito_requerido": float(payload.deposito_requerido), "zona_barrio_id": payload.zona_barrio_id,
            "direccion_referencial": payload.direccion_referencial, "reglas_convivencia": payload.reglas_convivencia,
            "estado": "PENDIENTE", "fecha_renovacion": datetime.now(timezone.utc),
            "fecha_expiracion": datetime.now(timezone.utc) + timedelta(days=30),
            "servicios_ids": servicios_ids, "servicios": [],
            "fotos": [str(u) for u in payload.fotos], "latitud": payload.latitud, "longitud": payload.longitud,
            "campus_ids": campus_ids, "usuario_id": user["id"],
            "telefono_verificado": bool(user.get("telefono_verificado", False)), "reportes_activos": 0,
        })
        return {"id": mock_id, "estado": "PENDIENTE (MOCK - sin PG)", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": DISCLAIMER, "detalle_mock": f"DB no disponible ({e}), se usó mock en memoria"}
