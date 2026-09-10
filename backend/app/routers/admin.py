"""routers/admin.py - Panel admin RBAC (métricas, moderación, control maestro).

Endpoints (todos solo ADMIN via require_admin -> 401 sin token, 403 sin rol):
  GET    /api/admin/metricas                    (totales plataforma)
  GET    /api/admin/pendientes?page&size        (bandeja PENDIENTE paginada)
  PATCH  /api/admin/publicaciones/{id}          (cambiar estado: aprobar/rechazar/pausar + audit)
  DELETE /api/admin/publicaciones/{id}          (eliminar, 204; hijos por ON DELETE CASCADE)

Sprint: mock en memoria si no hay PG (solo dev, mismo patrón que publicaciones).
"""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.session import get_session
from app.core.config import settings
from app.core.pagination import paginate_params, build_paginated
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PaginatedPublicaciones, PublicacionCardOut

import logging
logger = logging.getLogger("alojau.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


class MetricasOut(BaseModel):
    total_publicaciones: int = 0
    activas: int = 0
    pendientes: int = 0
    reportes_activos: int = 0
    reportes_pendientes: int = 0
    arrendadores_verificados: int = 0
    total_usuarios: int = 0


class CambioEstadoIn(BaseModel):
    estado: Literal["ACTIVO", "RECHAZADO", "PAUSADO"] = Field(description="aprobar->ACTIVO, rechazar->RECHAZADO, pausar->PAUSADO")


ESTADO_A_EVENTO = {"ACTIVO": "APPROVED", "RECHAZADO": "REJECTED", "PAUSADO": "PAUSED"}


@router.get("/metricas", response_model=MetricasOut, summary="Admin métricas globales")
async def metricas(
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    """Totales para /admin/dashboard. Sin token 401, no-ADMIN 403."""
    try:
        from app.models import Publicacion, ReportePublicacion, Usuario

        total = (await db.execute(select(func.count()).select_from(Publicacion))).scalar() or 0
        activas = (await db.execute(select(func.count()).select_from(Publicacion).where(Publicacion.estado == "ACTIVO"))).scalar() or 0
        pendientes = (await db.execute(select(func.count()).select_from(Publicacion).where(Publicacion.estado == "PENDIENTE"))).scalar() or 0
        rep_act = (await db.execute(select(func.count()).select_from(ReportePublicacion).where(ReportePublicacion.estado.in_(["PENDIENTE", "CONFIRMADO"])))).scalar() or 0
        rep_pen = (await db.execute(select(func.count()).select_from(ReportePublicacion).where(ReportePublicacion.estado == "PENDIENTE"))).scalar() or 0
        verif = (await db.execute(select(func.count()).select_from(Usuario).where(Usuario.rol == "ARRENDADOR", Usuario.telefono_verificado.is_(True)))).scalar() or 0
        users = (await db.execute(select(func.count()).select_from(Usuario))).scalar() or 0
        return MetricasOut(
            total_publicaciones=total, activas=activas, pendientes=pendientes,
            reportes_activos=rep_act, reportes_pendientes=rep_pen,
            arrendadores_verificados=verif, total_usuarios=users,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] metricas falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev: agrega desde MOCK_PUBS + MOCK_USERS de auth.
    from app.routers.publicaciones import MOCK_PUBS
    from app.routers.auth import MOCK_USERS

    pubs = MOCK_PUBS
    return MetricasOut(
        total_publicaciones=len(pubs),
        activas=sum(1 for p in pubs if p.get("estado") == "ACTIVO"),
        pendientes=sum(1 for p in pubs if p.get("estado") == "PENDIENTE"),
        reportes_activos=sum(int(p.get("reportes_activos", 0) or 0) for p in pubs),
        reportes_pendientes=0,
        arrendadores_verificados=sum(1 for u in MOCK_USERS.values() if u.get("rol") == "ARRENDADOR" and u.get("telefono_verificado")),
        total_usuarios=len(MOCK_USERS),
    )


@router.get("/pendientes", response_model=PaginatedPublicaciones, summary="Admin bandeja PENDIENTE")
async def pendientes(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    """Avisos PENDIENTE paginados (más recientes primero)."""
    try:
        from app.models import Publicacion

        total = (await db.execute(select(func.count()).select_from(Publicacion).where(Publicacion.estado == "PENDIENTE"))).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(Publicacion.estado == "PENDIENTE")
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
        logger.error(f"[DB fallback] pendientes falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    from app.routers.publicaciones import MOCK_PUBS

    filtradas = sorted(
        (p for p in MOCK_PUBS if p.get("estado") == "PENDIENTE"),
        key=lambda p: p["id"], reverse=True,
    )
    total = len(filtradas)
    offset, size_norm = paginate_params(page, size)
    items = [view.mock_to_out(p) for p in filtradas[offset:offset + size_norm]]
    return build_paginated(items, total, page, size_norm)


@router.patch("/publicaciones/{pub_id}", response_model=PublicacionCardOut, summary="Admin cambiar estado (aprobar/rechazar/pausar)")
async def cambiar_estado(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: CambioEstadoIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    """approve->ACTIVO (+audit APPROVED), rechazar->RECHAZADO (+REJECTED), pausar->PAUSADO (+PAUSED).
    404 si no existe. El dueño ve el cambio en Mis Publicaciones."""
    try:
        from app.models import Publicacion, PublicacionesAudit

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        p.estado = payload.estado
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
            evento=ESTADO_A_EVENTO[payload.estado],
            detalle=f"Cambio a {payload.estado} por admin",
        ))
        await db.commit()
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
        logger.error(f"[DB fallback] admin cambiar_estado {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    from app.routers.publicaciones import MOCK_PUBS

    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in MOCK_PUBS if x["id"] == pub_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    pub["estado"] = payload.estado
    return view.mock_to_out(pub)


@router.delete("/publicaciones/{pub_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Admin eliminar aviso")
async def eliminar(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    """Elimina cualquier aviso (hijos por ON DELETE CASCADE). 404 si no existe."""
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        await db.delete(p)
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"[DB fallback] admin eliminar {pub_id} falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    from app.routers.publicaciones import MOCK_PUBS

    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    for i, x in enumerate(MOCK_PUBS):
        if x["id"] == pub_id:
            MOCK_PUBS.pop(i)
            return Response(status_code=status.HTTP_204_NO_CONTENT)
    raise HTTPException(status_code=404, detail="Publicación no encontrada")
