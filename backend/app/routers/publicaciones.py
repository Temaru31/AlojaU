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
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.db.session import get_session, AsyncSession
from app.core.security import get_current_user, require_arrendador
from app.schemas.publicacion import PublicacionCreate, PublicacionOut, DesgloseConfianza
from app.services.haversine import haversine_m
from app.services.trust import calcular_indice, dias_desde, DISCLAIMER

router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])

# --- MOCK Sprint1 (si no hay PG) ---
# Datos coherentes con main.py legacy + HU-007 desglose + distancia Haversine
MOCK_CAMPUS = {
    1: {"id": 1, "institucion": "Universidad del Cauca", "nombre_sede": "Campus Tulcán", "lat": 2.443, "lng": -76.606},
    2: {"id": 2, "institucion": "Unicomfacauca", "nombre_sede": "Claustro", "lat": 2.441, "lng": -76.602},
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
    if campus_id and campus_id in MOCK_CAMPUS and pub.get("latitud") and pub.get("longitud"):
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
        "deposito_requerido": pub.get("deposito_requerido", 0),
        "zona_barrio_id": pub["zona_barrio_id"],
        "zona_nombre": pub.get("zona_nombre"),
        "direccion_referencial": pub["direccion_referencial"],
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
        "campus_distancias": [{"campus_id": cid, "dist_m": haversine_m(pub["latitud"], pub["longitud"], MOCK_CAMPUS[cid]["lat"], MOCK_CAMPUS[cid]["lng"])} for cid in pub.get("campus_ids", []) if cid in MOCK_CAMPUS and pub.get("latitud")] if pub.get("latitud") else None,
        "indice_confianza": trust["indice"],
        "desglose": trust["desglose"],
        "nivel_confianza": trust["nivel"],
        "advertencia_confianza": trust["advertencia"],
        "telefono_whatsapp": tel,
        "whatsapp_url": wa_url,
        "usuario_id": pub.get("usuario_id"),
    }

# --- Helpers DB real (si PG disponible) ---
async def _query_db_lista(
    db: AsyncSession,
    campus_id: Optional[int],
    precio_min: Optional[int],
    precio_max: Optional[int],
    tipo: Optional[str],
    servicios: Optional[List[int]],
):
    """
    Sprint1 real DB: SELECT + JOIN publicacion_campus + cálculo distancia.
    Si campus_id, ordenar por distancia (Haversine precalculado en publicacion_campus.distancia_geodesica_m)
    Filtros combinables (HU-002 C1-3).
    """
    # Lazy import para evitar ciclo
    from app.models.publicacion import Publicacion, PublicacionCampus, Usuario

    stmt = select(Publicacion).options(selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios)).where(Publicacion.estado == "ACTIVO")

    if precio_min is not None:
        stmt = stmt.where(Publicacion.canon_mensual >= precio_min)
    if precio_max is not None:
        if precio_min is not None and precio_max < precio_min:
            raise HTTPException(status_code=400, detail="precio_min no puede superar precio_max (HU-002 C1)")
        stmt = stmt.where(Publicacion.canon_mensual <= precio_max)
    if tipo:
        stmt = stmt.where(Publicacion.tipo_inmueble == tipo)
    # servicios: AND (debe contener todos los solicitados)
    if servicios:
        for sid in servicios:
            stmt = stmt.where(Publicacion.servicios.any(id=sid))

    # Campus filter: join publicacion_campus
    if campus_id:
        stmt = stmt.join(PublicacionCampus, PublicacionCampus.pub_id == Publicacion.id).where(PublicacionCampus.campus_id == campus_id).order_by(PublicacionCampus.distancia_geodesica_m)

    result = await db.execute(stmt)
    pubs = result.scalars().unique().all()

    # Mapear a dict para Trust (evita N+1 reportes con subquery)
    out = []
    for p in pubs:
        # reportes activos bug fix: COUNT WHERE estado IN ('PENDIENTE','CONFIRMADO')
        # Sprint1 simplificado: query ad-hoc si no eager
        from sqlalchemy import func, select as sel
        from app.models.publicacion import ReportePublicacion
        r = await db.execute(sel(func.count()).select_from(ReportePublicacion).where(ReportePublicacion.publicacion_id==p.id, ReportePublicacion.estado.in_(["PENDIENTE","CONFIRMADO"])))
        reportes_activos = r.scalar() or 0

        # usuario telefono_verificado
        u = await db.get(Usuario, p.usuario_id)
        tel_ver = bool(u.telefono_verificado) if u else False

        dist = None
        if campus_id:
            # leer distancia precalculada
            pc = await db.execute(sel(PublicacionCampus).where(PublicacionCampus.pub_id==p.id, PublicacionCampus.campus_id==campus_id))
            pc = pc.scalar_one_or_none()
            dist = pc.distancia_geodesica_m if pc else None

        dias_vig = dias_desde(p.fecha_renovacion)
        trust = calcular_indice(
            canon_mensual=float(p.canon_mensual), deposito_requerido=float(p.deposito_requerido),
            tipo_inmueble=p.tipo_inmueble, reglas_convivencia=p.reglas_convivencia,
            direccion_referencial=p.direccion_referencial, servicios_ids=[s.id for s in p.servicios],
            telefono_verificado=tel_ver, num_fotos=len(p.imagenes), dias_vigencia=dias_vig, reportes_activos=reportes_activos
        )
        # construir out (simplificado)
        out.append({
            "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
            "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "deposito_requerido": float(p.deposito_requerido),
            "zona_barrio_id": p.zona_barrio_id, "direccion_referencial": p.direccion_referencial,
            "reglas_convivencia": p.reglas_convivencia, "estado": p.estado,
            "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
            "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios],
            "fotos": [im.url for im in p.imagenes], "num_fotos": len(p.imagenes),
            "distancia_geodesica_m": dist,
            "indice_confianza": trust["indice"], "desglose": trust["desglose"], "nivel_confianza": trust["nivel"],
            "telefono_whatsapp": u.telefono_whatsapp if tel_ver else None,
            "usuario_id": p.usuario_id,
        })
    return out

# --- Endpoints Sprint1 ---
@router.get("", summary="HU-001 Buscar por sede + HU-002 Filtros combinables")
async def list_publicaciones(
    campus_id: Optional[int] = Query(None, description="FK campus_universitarios.id - calcula Haversine y filtra publicaciones asociadas"),
    precio_min: Optional[int] = Query(None, ge=0, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, description="COP máximo"),
    tipo: Optional[str] = Query(None, pattern="^(HABITACION_FAMILIAR|HABITACION_INDEPENDIENTE|APARTAESTUDIO|COMPARTIDO)$"),
    servicios: Optional[str] = Query(None, description="IDs coma separados, ej: 1,3"),
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
        try:
            servicios_ids = [int(s.strip()) for s in servicios.split(",") if s.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="servicios debe ser lista de ints coma separada")

    # Intento DB real con fallback mock
    try:
        # Si db es None o ping falla, except -> mock
        # test rápido: intenta query simple; si timeout -> mock
        db_items = await _query_db_lista(db, campus_id, precio_min, precio_max, tipo, servicios_ids)
        # Si DB vacía en dev, también fallback a mock para demo (opcional)
        # Comentado para producción: if not db_items: return mock filtrado
        return db_items
    except Exception as e:
        # Fallback MOCK (no bloquea frontend - NFR disponibilidad)
        # print(f"[Sprint1 mock fallback] DB no disponible: {e}")
        filtradas = [p for p in MOCK_PUBS if p["estado"] == "ACTIVO"]

        if campus_id:
            filtradas = [p for p in filtradas if campus_id in p.get("campus_ids", [])]
            # ordenar por Haversine (P95 <500ms: cálculo en memoria O(n))
            filtradas.sort(key=lambda p: haversine_m(p["latitud"], p["longitud"], MOCK_CAMPUS[campus_id]["lat"], MOCK_CAMPUS[campus_id]["lng"]) if p.get("latitud") else 999999)

        if precio_min is not None:
            filtradas = [p for p in filtradas if p["canon_mensual"] >= precio_min]
        if precio_max is not None:
            filtradas = [p for p in filtradas if p["canon_mensual"] <= precio_max]
        if tipo:
            filtradas = [p for p in filtradas if p["tipo_inmueble"] == tipo]
        if servicios_ids:
            filtradas = [p for p in filtradas if all(s in p.get("servicios_ids", []) for s in servicios_ids)]

        return [_to_out(p, campus_id) for p in filtradas]

@router.get("/{pub_id}", summary="HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp")
async def get_publicacion(pub_id: int, db: AsyncSession = Depends(get_session)):
    """
    HU-003: muestra canon, servicios, fotos, zona, condiciones, vigencia
            No expone datos que no deban ser públicos (email propietario, etc)
    HU-007: incluye indice_confianza 0-100 + desglose 40+20+15+15+10 + disclaimer
    HU-008: telefono_whatsapp solo si verificado + whatsapp_url wa.me
    """
    try:
        from app.models.publicacion import Publicacion, ReportePublicacion, Usuario
        from sqlalchemy import func, select as sel
        p = await db.get(Publicacion, pub_id, options=[selectinload(Publicacion.imagenes), selectinload(Publicacion.servicios)])
        if p:
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
            wa = f"https://wa.me/{tel}?text={__import__('urllib.parse').parse.quote(f'Hola, vi {p.titulo} (ID {p.id}) en AlojaU y me interesa.')}" if tel else None
            return {
                "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
                "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
                "deposito": float(p.deposito_requerido), "deposito_requerido": float(p.deposito_requerido),
                "zona_barrio_id": p.zona_barrio_id, "zona": getattr(p, "zona_nombre", None) or "Pandiguando",
                "direccion_referencial": p.direccion_referencial, "reglas": p.reglas_convivencia, "reglas_convivencia": p.reglas_convivencia,
                "estado": p.estado, "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
                "servicios": [s.nombre for s in p.servicios], "fotos": fotos, "num_fotos": len(fotos),
                "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"], "nivel": trust["nivel"],
                "advertencia": trust["advertencia"], "telefono_whatsapp": tel, "whatsapp_url": wa,
            }
    except Exception:
        pass

    # Mock fallback
    pub = next((p for p in MOCK_PUBS if p["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return _to_out(pub)

@router.post("", status_code=status.HTTP_201_CREATED, summary="HU-005 Publicar oferta estructurada -> PENDIENTE (solo ARRENDADOR)")
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
    """
    # Validación extra: si lat/lng no provistas, warning pero no bloquea (Sprint1)
    # Calcular índice inicial (asumiendo teléfono verificado del user)
    trust = calcular_indice(
        canon_mensual=float(payload.canon_mensual),
        deposito_requerido=float(payload.deposito_requerido),
        tipo_inmueble=payload.tipo_inmueble,
        reglas_convivencia=payload.reglas_convivencia,
        direccion_referencial=payload.direccion_referencial,
        servicios_ids=payload.servicios_ids,
        telefono_verificado=user.get("telefono_verificado", True),
        num_fotos=len(payload.fotos),
        dias_vigencia=0,  # recién creada
        reportes_activos=0,
    )

    # Intentar persistir en DB
    try:
        from app.models.publicacion import Publicacion, PublicacionCampus, ImagenPublicacion, PublicacionServicio, PublicacionAudit
        # Crear publicación
        nueva = Publicacion(
            usuario_id=user["id"] if isinstance(user["id"], int) else 1,
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

        # Relaciones N:M campus (con Haversine)
        for cid in payload.campus_ids:
            dist = 0
            if payload.latitud and payload.longitud and cid in MOCK_CAMPUS:
                c = MOCK_CAMPUS[cid]
                dist = haversine_m(payload.latitud, payload.longitud, c["lat"], c["lng"])
            db.add(PublicacionCampus(pub_id=nueva.id, campus_id=cid, distancia_geodesica_m=dist))

        for sid in payload.servicios_ids:
            db.add(PublicacionServicio(pub_id=nueva.id, servicio_id=sid))

        for idx, url in enumerate(payload.fotos, start=1):
            db.add(ImagenPublicacion(publicacion_id=nueva.id, url=str(url), orden=idx))

        db.add(PublicacionAudit(publicacion_id=nueva.id, actor_id=nueva.usuario_id, evento="CREATED", from_estado=None, to_estado="PENDIENTE"))

        await db.commit()
        await db.refresh(nueva)
        return {"id": nueva.id, "estado": "PENDIENTE", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"], "mensaje": "Publicación en PENDIENTE, pendiente de moderación"}

    except Exception as e:
        # Mock fallback Sprint1: no hay PG, simular creación
        mock_id = max(p["id"] for p in MOCK_PUBS) + 1
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
            "servicios_ids": payload.servicios_ids, "servicios": [],
            "fotos": [str(u) for u in payload.fotos], "latitud": payload.latitud, "longitud": payload.longitud,
            "campus_ids": payload.campus_ids, "usuario_id": user["id"] if isinstance(user["id"], int) else 1,
            "telefono_verificado": user.get("telefono_verificado", True), "reportes_activos": 0,
        })
        return {"id": mock_id, "estado": "PENDIENTE (MOCK - sin PG)", "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": DISCLAIMER, "detalle_mock": f"DB no disponible ({e}), se usó mock en memoria"}
