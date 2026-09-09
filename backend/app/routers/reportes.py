"""Reportes ciudadanos HU-011 + bandeja admin HU-010B (T1).
POST público/anónimo con anti-spam; GET/PATCH solo ADMIN.
Estados DB (chk_reporte_estado): PENDIENTE -> CONFIRMADO (revisado, procede) o DESCARTADO (revisado, no procede).
Uso: POST /api/reportes (anónimo) + GET/PATCH /api/reportes (admin)."""
import time
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_optional_user, require_admin
from app.core.config import settings
from app.db.session import get_session

import logging
logger = logging.getLogger("alojau.reportes")

router = APIRouter(prefix="/api/reportes", tags=["reportes"])

MotivoReporte = Literal["POSIBLE_ESTAFA", "DATOS_FALSOS", "INMUEBLE_ARRENDADO", "FOTOS_ENGANOSAS", "OTRO"]
ESTADOS_REVISADOS = ("CONFIRMADO", "DESCARTADO")


class ReporteIn(BaseModel):
    publicacion_id: int = Field(gt=0, le=1000000)
    motivo: MotivoReporte
    detalle: Optional[str] = Field(default=None, min_length=0, max_length=500)


class ReporteOut(BaseModel):
    id: int
    publicacion_id: int
    usuario_id: Optional[int] = None
    motivo: str
    detalle: Optional[str] = None
    estado: str
    fecha_creacion: Optional[datetime] = None


class ReporteAccionIn(BaseModel):
    accion: Literal["confirmar", "descartar"]


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


# Anti-spam en memoria: 5 reportes/min por IP -> 429 (igual patrón que auth login).
_REPORT_ATTEMPTS: dict[str, list[float]] = {}
REPORT_LIMIT = 5
REPORT_WINDOW_S = 60.0


def _check_report_rate_limit(request: Request):
    ip = request.client.host if request.client and request.client.host else "unknown"
    now = time.monotonic()
    hist = [t for t in _REPORT_ATTEMPTS.get(ip, []) if now - t < REPORT_WINDOW_S]
    if len(hist) >= REPORT_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiados reportes, espera 1 minuto (anti-spam)")
    hist.append(now)
    _REPORT_ATTEMPTS[ip] = hist


def _to_out(r) -> dict:
    return {
        "id": r.id,
        "publicacion_id": r.publicacion_id,
        "usuario_id": r.usuario_id,
        "motivo": r.motivo,
        "detalle": r.detalle,
        "estado": r.estado,
        "fecha_creacion": r.fecha_creacion,
    }


@router.post("", response_model=ReporteOut, status_code=201, summary="HU-011 Reportar aviso (público, anónimo)")
async def crear_reporte(
    payload: ReporteIn,
    request: Request,
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """Crea reporte PENDIENTE (anónimo si no hay token). 404 si la publicación no existe."""
    user = get_optional_user(authorization)
    try:
        from app.models import Publicacion, ReportePublicacion

        pub = await db.get(Publicacion, payload.publicacion_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        _check_report_rate_limit(request)
        nuevo = ReportePublicacion(
            publicacion_id=payload.publicacion_id,
            usuario_id=user.get("id") if user and isinstance(user.get("id"), int) else None,
            motivo=payload.motivo,
            detalle=payload.detalle,
            estado="PENDIENTE",
        )
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return _to_out(nuevo)
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[reportes crear] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible (dev sin PG)")


@router.get("", response_model=List[ReporteOut], summary="HU-010B Bandeja reportes (solo ADMIN)")
async def listar_reportes(
    estado: Optional[str] = Query(None, pattern="^(PENDIENTE|CONFIRMADO|DESCARTADO)$"),
    db: AsyncSession = Depends(get_session),
    _admin: dict = Depends(require_admin),
):
    """Lista reportes (filtro opcional por estado), más recientes primero."""
    from app.models import ReportePublicacion

    stmt = select(ReportePublicacion).order_by(ReportePublicacion.id.desc())
    if estado:
        stmt = stmt.where(ReportePublicacion.estado == estado)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.patch("/{reporte_id}", response_model=ReporteOut, summary="HU-010B Revisar reporte (solo ADMIN)")
async def revisar_reporte(
    reporte_id: int,
    payload: ReporteAccionIn,
    db: AsyncSession = Depends(get_session),
    _admin: dict = Depends(require_admin),
):
    """confirmar -> CONFIRMADO (revisado, procede) | descartar -> DESCARTADO. Solo desde PENDIENTE."""
    from app.models import ReportePublicacion

    rep = await db.get(ReportePublicacion, reporte_id)
    if not rep:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if rep.estado != "PENDIENTE":
        raise HTTPException(
            status_code=409,
            detail=f"Reporte ya revisado (estado {rep.estado})",
        )
    rep.estado = "CONFIRMADO" if payload.accion == "confirmar" else "DESCARTADO"
    await db.commit()
    await db.refresh(rep)
    return _to_out(rep)
