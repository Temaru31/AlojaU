"""Reportes ciudadanos HU-011 + bandeja admin HU-010B (T1).
POST público/anónimo con anti-spam; GET/PATCH solo ADMIN.
Estados DB (chk_reporte_estado): PENDIENTE -> CONFIRMADO (revisado, procede) o DESCARTADO (revisado, no procede).
Uso: POST /api/reportes (anónimo) + GET/PATCH /api/reportes (admin)."""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_optional_user, require_admin
from app.core.logseguro import exc_resumen
from app.db.session import get_session

import logging
from app.core.db_utils import rollback_seguro
from app.core.net import ip_para_limites
from app.core.rate_limit import registrar_intento
from app.core.dominio import EstadoPublicacion, EstadoReporte
logger = logging.getLogger("alojau.reportes")

router = APIRouter(prefix="/api/reportes", tags=["reportes"])

MotivoReporte = Literal["POSIBLE_ESTAFA", "DATOS_FALSOS", "INMUEBLE_ARRENDADO", "FOTOS_ENGANOSAS", "OTRO"]
ESTADOS_REVISADOS = (EstadoReporte.CONFIRMADO, EstadoReporte.DESCARTADO)


def _rechazar_html(v: Optional[str]) -> Optional[str]:
    """Texto plano sin HTML ejecutable (defensa en profundidad: el frontend
    React escapa por defecto, pero la API también la consumen terceros).
    Mismo criterio que PublicacionCreate (cubre <img onerror>, <svg>...)."""
    if v is not None and ("<" in v or ">" in v):
        raise ValueError("no se permite HTML ni los caracteres < > (texto plano)")
    return v


class ReporteIn(BaseModel):
    publicacion_id: int = Field(gt=0, le=1000000)
    motivo: MotivoReporte
    detalle: Optional[str] = Field(default=None, min_length=0, max_length=500)

    @field_validator("detalle")
    @classmethod
    def detalle_sin_html(cls, v):
        return _rechazar_html(v)


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


# Anti-spam en memoria: 5 reportes/min por IP -> 429 (igual patrón que auth login).
_REPORT_ATTEMPTS: dict[str, list[float]] = {}
REPORT_LIMIT = 5
REPORT_WINDOW_S = 60.0


def clear_report_rate_limit_for_tests() -> None:
    """Limpia el bucket anti-spam (solo tests).

    TestClient siempre usa la misma IP ("testclient"): sin limpieza, un
    archivo que reporta mucho deja al siguiente en 429 según el orden de
    ejecución (falso negativo intermitente). Patrón del repo (cfr.
    clear_rol_cache_for_tests en core/security).
    """
    _REPORT_ATTEMPTS.clear()


def _check_report_rate_limit(request: Request) -> None:
    registrar_intento(_REPORT_ATTEMPTS, ip_para_limites(request), REPORT_LIMIT, REPORT_WINDOW_S,
                      "Demasiados reportes, espera 1 minuto (anti-spam)")


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
    """Crea reporte PENDIENTE (anónimo si no hay token).

    Anti-oráculo: inexistente y no-ACTIVO responden el MISMO 404 genérico,
    para no revelar avisos privados/pendientes por diferencia de respuesta.
    Solo avisos ACTIVO y de dueño activo son reportables.
    """
    user = await get_optional_user(authorization)
    try:
        from app.models import Publicacion, ReportePublicacion

        pub = await db.get(Publicacion, payload.publicacion_id)
        if not pub or pub.estado != EstadoPublicacion.ACTIVO:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        # Dueño en soft-delete: mismo 404 (el aviso es invisible).
        from app.models import Usuario
        dueno = await db.get(Usuario, pub.usuario_id)
        if dueno is not None and getattr(dueno, "eliminado_en", None) is not None:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        _check_report_rate_limit(request)
        nuevo = ReportePublicacion(
            publicacion_id=payload.publicacion_id,
            usuario_id=user.get("id") if user and isinstance(user.get("id"), int) else None,
            motivo=payload.motivo,
            detalle=payload.detalle,
            estado=EstadoReporte.PENDIENTE,
        )
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return _to_out(nuevo)
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "crear_reporte")
        logger.error(f"[reportes crear] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("", response_model=List[ReporteOut], summary="HU-010B Bandeja reportes (solo ADMIN)")
async def listar_reportes(
    estado: Optional[str] = Query(None, pattern="^(PENDIENTE|CONFIRMADO|DESCARTADO)$"),
    db: AsyncSession = Depends(get_session),
    _admin: dict = Depends(require_admin),
    # Al final a propósito: llamadas directas existentes usan (estado, db, admin)
    # posicional. Cota defensiva sin cambiar el shape de respuesta.
    limit: int = Query(200, ge=1, le=500, description="Cota defensiva: la bandeja crece sin paginar"),
):
    """Lista reportes (filtro opcional por estado), más recientes primero.

    Sin paginación histórica: se acota con `limit` (mismo shape de respuesta,
    sin romper el panel admin) para que la tabla no agote memoria del worker.
    """
    from app.models import ReportePublicacion

    # Llamadas directas (tests/CI) no resuelven el default Query: si llega el
    # objeto Query en vez de int, se usa la cota por defecto (HTTP sí valida
    # ge/le vía FastAPI y da 422 fuera de rango).
    lim = limit if isinstance(limit, int) else 200
    lim = max(1, min(lim, 500))
    try:
        stmt = select(ReportePublicacion).order_by(ReportePublicacion.id.desc())
        if estado:
            stmt = stmt.where(ReportePublicacion.estado == estado)
        rows = (await db.execute(stmt.limit(lim))).scalars().all()
        return [_to_out(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "listar_reportes")
        logger.error(f"[reportes listar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/{reporte_id}", response_model=ReporteOut, summary="HU-010B Revisar reporte (solo ADMIN)")
async def revisar_reporte(
    reporte_id: int,
    payload: ReporteAccionIn,
    db: AsyncSession = Depends(get_session),
    _admin: dict = Depends(require_admin),
):
    """confirmar -> CONFIRMADO (revisado, procede) | descartar -> DESCARTADO. Solo desde PENDIENTE."""
    from app.models import ReportePublicacion

    try:
        rep = await db.get(ReportePublicacion, reporte_id)
        if not rep:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")
        if rep.estado != EstadoReporte.PENDIENTE:
            raise HTTPException(
                status_code=409,
                detail=f"Reporte ya revisado (estado {rep.estado})",
            )
        rep.estado = EstadoReporte.CONFIRMADO if payload.accion == "confirmar" else EstadoReporte.DESCARTADO
        await db.commit()
        await db.refresh(rep)
        return _to_out(rep)
    except HTTPException:
        await rollback_seguro(db, "revisar_reporte")
        raise
    except Exception as e:
        await rollback_seguro(db, "revisar_reporte")
        logger.error(f"[reportes revisar] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
