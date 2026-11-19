"""Routers Fase 2: bandeja in-app + CRUD de búsquedas guardadas.

- GET /api/notificaciones: lectura PURA (sin escrituras, sin purga).
- PATCH .../leer y .../leer-todas: únicos escritores de `leida`.
- /api/busquedas-guardadas: POST (mínimo 1 filtro, tope 10 activas), GET mías, DELETE propia.
- Sin BD: 503 honesto (fuente única en BD).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, model_validator

from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.core.pagination import paginate_params
from app.repositories.notificaciones_repo import NotificacionesRepo, get_notificaciones_repo

import logging
from app.core.db_utils import rollback_seguro
logger = logging.getLogger("alojau.notificaciones")

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])
router_busquedas = APIRouter(prefix="/api/busquedas-guardadas", tags=["busquedas"])

MAX_ALERTAS_ACTIVAS = 10

MENSAJE_SIN_FILTROS = (
    "Selecciona al menos un filtro (zona, precio o tipo) "
    "para crear una alerta relevante."
)


def _tiene_filtros(data: "BusquedaIn") -> bool:
    """Anti-spam: una alerta sin ningún filtro matchearía TODO y generaría
    notificaciones masivas innecesarias en cada publicación."""
    if data.zona_barrio_id is not None:
        return True
    if data.campus_id is not None:
        return True
    if data.precio_min is not None or data.precio_max is not None:
        return True
    if (data.tipo or "").strip():
        return True
    return bool(data.servicios_ids)


# Schemas
class NotificacionOut(BaseModel):
    id: int
    tipo: str
    titulo: str
    cuerpo: str = ""
    publicacion_id: Optional[int] = None
    leida: bool = False
    leida_en: Optional[datetime] = None
    created_at: Optional[datetime] = None


class BandejaOut(BaseModel):
    items: list[NotificacionOut]
    total: int
    no_leidas: int
    page: int
    size: int
    pages: int


class BusquedaIn(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=80)
    precio_min: Optional[float] = Field(default=None, ge=0)
    precio_max: Optional[float] = Field(default=None, ge=0)
    campus_id: Optional[int] = Field(default=None, gt=0)
    zona_barrio_id: Optional[int] = Field(default=None, gt=0)
    tipo: Optional[str] = Field(default=None, max_length=40)
    servicios_ids: list[int] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def _rango_valido(self):
        if (self.precio_min is not None and self.precio_max is not None
                and self.precio_min > self.precio_max):
            raise ValueError("precio_min no puede superar a precio_max")
        return self


class BusquedaOut(BaseModel):
    id: int
    nombre: Optional[str] = None
    precio_min: Optional[float] = None
    precio_max: Optional[float] = None
    campus_id: Optional[int] = None
    zona_barrio_id: Optional[int] = None
    tipo: Optional[str] = None
    servicios_ids: list[int] = Field(default_factory=list)
    activa: bool = True
    created_at: Optional[datetime] = None


def _a_out(n) -> dict:
    return {"id": n.id, "tipo": n.tipo, "titulo": n.titulo,
            "cuerpo": n.cuerpo or "", "publicacion_id": n.publicacion_id,
            "leida": bool(n.leida), "leida_en": n.leida_en,
            "created_at": n.created_at}


def _b_out(b) -> dict:
    return {"id": b.id, "nombre": b.nombre, "precio_min": b.precio_min,
            "precio_max": b.precio_max, "campus_id": b.campus_id,
            "zona_barrio_id": b.zona_barrio_id, "tipo": b.tipo,
            "servicios_ids": list(b.servicios_ids or []),
            "activa": bool(b.activa), "created_at": b.created_at}


# Bandeja
@router.get("", response_model=BandejaOut, summary="Bandeja in-app (lectura pura)")
async def listar(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(9, ge=1, le=50),
    solo_no_leidas: bool = Query(False),
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """Paginado ≤50 + conteo de no leídas. Sin escrituras (ni purga)."""
    uid = id_propietario(user)
    try:
        offset, size = paginate_params(page, size)
        total, rows = await repo.pagina(uid, offset, size, solo_no_leidas)
        no_leidas = await repo.no_leidas(uid)
        pages = (total + size - 1) // size if size else 1
        return {"items": [_a_out(n) for n in rows], "total": total,
                "no_leidas": no_leidas, "page": page, "size": size, "pages": pages}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "listar")
        logger.error(f"[notificaciones listar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/leer-todas", summary="Marcar toda la bandeja como leída")
async def leer_todas(
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """Un UPDATE por usuario. Declarada ANTES de /{id}/leer (orden de rutas)."""
    uid = id_propietario(user)
    try:
        actualizadas = await repo.marcar_todas_leidas(uid)
        await repo.db.commit()
        return {"actualizadas": actualizadas}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "leer_todas")
        logger.error(f"[notificaciones leer-todas] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/{nid}/leer", response_model=NotificacionOut, summary="Marcar una como leída")
async def leer_una(
    nid: int = Path(..., ge=1),
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """404 si no existe, 403 si es ajena (IDOR)."""
    uid = id_propietario(user)
    try:
        n = await repo.notificacion(nid)
        if n is None:
            raise HTTPException(status_code=404, detail="Notificación no encontrada")
        if int(n.usuario_id) != uid:
            raise HTTPException(status_code=403, detail="No puedes leer avisos ajenos")
        n.leida = True
        n.leida_en = datetime.now(timezone.utc)
        await repo.db.commit()
        await repo.db.refresh(n)
        return _a_out(n)
    except HTTPException:
        await rollback_seguro(repo.db, "leer_una")
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "leer_una")
        logger.error(f"[notificaciones leer] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


# Búsquedas guardadas
@router_busquedas.post("", response_model=BusquedaOut, status_code=201,
                       summary="Guardar alerta (tope 10 activas)")
async def crear_busqueda(
    data: BusquedaIn,
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """Valida tope anti-abuso + FKs de catálogo. 422 con guía si algo falla."""
    uid = id_propietario(user)
    if not _tiene_filtros(data):
        raise HTTPException(status_code=422, detail=MENSAJE_SIN_FILTROS)
    try:
        from app.models import BusquedaGuardada
        if await repo.alertas_activas(uid) >= MAX_ALERTAS_ACTIVAS:
            raise HTTPException(
                status_code=422,
                detail=f"Has alcanzado el límite de {MAX_ALERTAS_ACTIVAS} alertas activas. "
                       f"Gestiona o elimina una existente para crear una nueva.",
            )
        if data.campus_id is not None and not await repo.existe_campus(data.campus_id):
            raise HTTPException(status_code=422, detail="campus_id no existe")
        if data.zona_barrio_id is not None and not await repo.existe_zona(data.zona_barrio_id):
            raise HTTPException(status_code=422, detail="zona_barrio_id no existe")
        b = BusquedaGuardada(
            usuario_id=uid, nombre=(data.nombre or "").strip() or None,
            precio_min=data.precio_min, precio_max=data.precio_max,
            campus_id=data.campus_id, zona_barrio_id=data.zona_barrio_id,
            tipo=(data.tipo.strip().upper() if data.tipo else None) or None,
            servicios_ids=[int(s) for s in (data.servicios_ids or [])],
        )
        repo.db.add(b)
        await repo.db.commit()
        await repo.db.refresh(b)
        return _b_out(b)
    except HTTPException:
        await rollback_seguro(repo.db, "crear_busqueda")
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "crear_busqueda")
        logger.error(f"[busquedas crear] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router_busquedas.get("", summary="Listar mis alertas")
async def listar_busquedas(
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """Todas las mías (≤10 activas + inactivas), recientes primero."""
    uid = id_propietario(user)
    try:
        return [_b_out(b) for b in await repo.alertas(uid)]
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "listar_busquedas")
        logger.error(f"[busquedas listar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router_busquedas.delete("/{bid}", summary="Eliminar una alerta propia")
async def eliminar_busqueda(
    bid: int = Path(..., ge=1),
    user: ClaimsUsuario = Depends(get_current_user),
    repo: NotificacionesRepo = Depends(get_notificaciones_repo),
):
    """Borrado físico (config propia, sin auditoría): 404/403. Las
    notificaciones ya creadas se conservan (busqueda_id pasa a NULL)."""
    uid = id_propietario(user)
    try:
        b = await repo.alerta(bid)
        if b is None:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")
        if int(b.usuario_id) != uid:
            raise HTTPException(status_code=403, detail="No puedes borrar alertas ajenas")
        await repo.db.delete(b)
        await repo.db.commit()
        return {"eliminada": True, "id": bid}
    except HTTPException:
        await rollback_seguro(repo.db, "eliminar_busqueda")
        raise
    except Exception as e:
        await rollback_seguro(repo.db, "eliminar_busqueda")
        logger.error(f"[busquedas eliminar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
