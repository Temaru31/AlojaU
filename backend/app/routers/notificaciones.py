"""Routers Fase 2: bandeja in-app + CRUD de búsquedas guardadas.

- GET /api/notificaciones: lectura PURA (sin escrituras, sin purga).
- PATCH .../leer y .../leer-todas: únicos escritores de `leida`.
- /api/busquedas-guardadas: POST (tope 10 activas), GET mías, DELETE propia.
- Sin PG (mock/dev): 503 honesto (sin stores mock: es módulo nuevo con
  fuente única en BD, igual que POST /api/reportes en dev sin PG).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.core.logseguro import exc_resumen
from app.core.config import settings
from app.core.pagination import paginate_params
from app.db.session import get_session

import logging
logger = logging.getLogger("alojau.notificaciones")

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])
router_busquedas = APIRouter(prefix="/api/busquedas-guardadas", tags=["busquedas"])

MAX_ALERTAS_ACTIVAS = 10


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
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


def _uid(user: dict) -> int:
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    return uid


# ---------------------------------------------------------------------------
# Bandeja
# ---------------------------------------------------------------------------
@router.get("", response_model=BandejaOut, summary="Bandeja in-app (lectura pura)")
async def listar(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(9, ge=1, le=50),
    solo_no_leidas: bool = Query(False),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Paginado ≤50 + conteo de no leídas. Sin escrituras (ni purga)."""
    uid = _uid(user)
    try:
        from app.models import Notificacion
        offset, size = paginate_params(page, size)
        conds = [Notificacion.usuario_id == uid]
        if solo_no_leidas:
            conds.append(Notificacion.leida.is_(False))
        total = (await db.execute(
            select(func.count()).select_from(Notificacion).where(*conds))).scalar() or 0
        rows = (await db.execute(
            select(Notificacion).where(*conds)
            .order_by(Notificacion.created_at.desc()).offset(offset).limit(size)
        )).scalars().all()
        no_leidas = (await db.execute(
            select(func.count()).select_from(Notificacion).where(
                Notificacion.usuario_id == uid, Notificacion.leida.is_(False))
        )).scalar() or 0
        pages = (total + size - 1) // size if size else 1
        return {"items": [_a_out(n) for n in rows], "total": total,
                "no_leidas": no_leidas, "page": page, "size": size, "pages": pages}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[notificaciones listar] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


@router.patch("/leer-todas", summary="Marcar toda la bandeja como leída")
async def leer_todas(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Un UPDATE por usuario. Declarada ANTES de /{id}/leer (orden de rutas)."""
    uid = _uid(user)
    try:
        from app.models import Notificacion
        ahora = datetime.now(timezone.utc)
        res = await db.execute(
            Notificacion.__table__.update().where(
                Notificacion.usuario_id == uid,
                Notificacion.leida.is_(False),
            ).values(leida=True, leida_en=ahora)
        )
        await db.commit()
        return {"actualizadas": res.rowcount or 0}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[notificaciones leer-todas] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


@router.patch("/{nid}/leer", response_model=NotificacionOut, summary="Marcar una como leída")
async def leer_una(
    nid: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """404 si no existe, 403 si es ajena (IDOR)."""
    uid = _uid(user)
    try:
        from app.models import Notificacion
        n = await db.get(Notificacion, nid)
        if n is None:
            raise HTTPException(status_code=404, detail="Notificación no encontrada")
        if int(n.usuario_id) != uid:
            raise HTTPException(status_code=403, detail="No puedes leer avisos ajenos")
        n.leida = True
        n.leida_en = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(n)
        return _a_out(n)
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
        logger.error(f"[notificaciones leer] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


# ---------------------------------------------------------------------------
# Búsquedas guardadas
# ---------------------------------------------------------------------------
@router_busquedas.post("", response_model=BusquedaOut, status_code=201,
                       summary="Guardar alerta (tope 10 activas)")
async def crear_busqueda(
    data: BusquedaIn,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Valida tope anti-abuso + FKs de catálogo. 422 con guía si algo falla."""
    uid = _uid(user)
    try:
        from app.models import BusquedaGuardada
        n_activas = (await db.execute(
            select(func.count()).select_from(BusquedaGuardada).where(
                BusquedaGuardada.usuario_id == uid,
                BusquedaGuardada.activa.is_(True))
        )).scalar() or 0
        if n_activas >= MAX_ALERTAS_ACTIVAS:
            raise HTTPException(
                status_code=422,
                detail=f"Máximo {MAX_ALERTAS_ACTIVAS} alertas activas: desactiva o elimina una.",
            )
        if data.campus_id is not None:
            from app.models import CampusUniversitario
            if await db.get(CampusUniversitario, data.campus_id) is None:
                raise HTTPException(status_code=422, detail="campus_id no existe")
        if data.zona_barrio_id is not None:
            from app.models import ZonaBarrio
            if await db.get(ZonaBarrio, data.zona_barrio_id) is None:
                raise HTTPException(status_code=422, detail="zona_barrio_id no existe")
        b = BusquedaGuardada(
            usuario_id=uid, nombre=(data.nombre or "").strip() or None,
            precio_min=data.precio_min, precio_max=data.precio_max,
            campus_id=data.campus_id, zona_barrio_id=data.zona_barrio_id,
            tipo=(data.tipo.strip().upper() if data.tipo else None) or None,
            servicios_ids=[int(s) for s in (data.servicios_ids or [])],
        )
        db.add(b)
        await db.commit()
        await db.refresh(b)
        return _b_out(b)
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
        logger.error(f"[busquedas crear] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


@router_busquedas.get("", summary="Listar mis alertas")
async def listar_busquedas(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Todas las mías (≤10 activas + inactivas), recientes primero."""
    uid = _uid(user)
    try:
        from app.models import BusquedaGuardada
        rows = (await db.execute(
            select(BusquedaGuardada).where(BusquedaGuardada.usuario_id == uid)
            .order_by(BusquedaGuardada.id.desc())
        )).scalars().all()
        return [_b_out(b) for b in rows]
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[busquedas listar] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


@router_busquedas.delete("/{bid}", summary="Eliminar una alerta propia")
async def eliminar_busqueda(
    bid: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Borrado físico (config propia, sin auditoría): 404/403. Las
    notificaciones ya creadas se conservan (busqueda_id pasa a NULL)."""
    uid = _uid(user)
    try:
        from app.models import BusquedaGuardada
        b = await db.get(BusquedaGuardada, bid)
        if b is None:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")
        if int(b.usuario_id) != uid:
            raise HTTPException(status_code=403, detail="No puedes borrar alertas ajenas")
        await db.delete(b)
        await db.commit()
        return {"eliminada": True, "id": bid}
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
        logger.error(f"[busquedas eliminar] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")
