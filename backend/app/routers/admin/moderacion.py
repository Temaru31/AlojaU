"""Moderación de avisos: aprobar/rechazar/pausar, borrar y cambios masivos."""
import asyncio
import logging
from dataclasses import dataclass, field

from fastapi import APIRouter
from fastapi import Depends, HTTPException, Path, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import require_admin, ClaimsUsuario, id_o_none
from app.core.logseguro import exc_resumen
from app.db.session import get_session
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PublicacionCardOut
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion
from app.routers.admin.avisos_dueno import (
    ESTADO_A_EVENTO,
    _evaluar_democion_dueno,
    _notificar_dueno_estado,
    _notificar_moderacion_in_app,
)
from app.routers.admin.esquemas import BulkEstadoIn, CambioEstadoIn

logger = logging.getLogger("alojau.admin")
router = APIRouter()


@router.patch(
    "/publicaciones/{pub_id}",
    response_model=PublicacionCardOut,
    summary="Admin cambiar estado (aprobar/rechazar/pausar)",
)
async def cambiar_estado(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: CambioEstadoIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """approve->ACTIVO (+audit APPROVED), rechazar->RECHAZADO (+REJECTED), pausar->PAUSADO (+PAUSED).
    404 si no existe. El dueño ve el cambio en Mis Publicaciones y recibe DM
    de Telegram si vinculó su chat (best-effort)."""
    try:
        from app.models import Publicacion, PublicacionesAudit

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        p.estado = payload.estado
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=id_o_none(admin),
            evento=ESTADO_A_EVENTO[payload.estado],
            detalle=f"Cambio a {payload.estado} por admin",
        ))
        await _evaluar_democion_dueno(db, p.usuario_id)
        await _notificar_moderacion_in_app(db, p, payload.estado)
        await db.commit()
        dueno_id, titulo = p.usuario_id, p.titulo
        stmt = repo.select_con_relaciones().where(Publicacion.id == pub_id)
        p = (await db.execute(stmt)).scalars().unique().one()
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, [p], None)
        # Aviso fuera de la app (no bloquea la respuesta si Telegram falla).
        await _notificar_dueno_estado(db, dueno_id, titulo, payload.estado)
        return view.cards_for_page([p], rep_map, users_map, {}, None, True)[0]
    except HTTPException:
        await rollback_seguro(db, "cambiar_estado")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] admin cambiar_estado {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "cambiar_estado")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.delete("/publicaciones/{pub_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Admin eliminar aviso")
async def eliminar(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Elimina cualquier aviso (hijos por ON DELETE CASCADE). 404 si no existe."""
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        dueno_id = p.usuario_id
        await db.delete(p)
        await _evaluar_democion_dueno(db, dueno_id)  # el borrado también recuenta inventario
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        await rollback_seguro(db, "eliminar")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] admin eliminar {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "eliminar")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/publicaciones/bulk-approve", summary="Admin: aprobar en lote (con audit)")
async def bulk_approve(
    data: BulkEstadoIn,
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Moderación masiva. Transacción única: estados + audit APPROVED."""
    return await _bulk_cambiar_estado(db, admin, data.ids, EstadoPublicacion.ACTIVO, "APPROVED")


@router.post("/publicaciones/bulk-reject", summary="Admin: rechazar en lote (con audit)")
async def bulk_reject(
    data: BulkEstadoIn,
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Moderación masiva. Transacción única: estados + audit REJECTED."""
    return await _bulk_cambiar_estado(db, admin, data.ids, EstadoPublicacion.RECHAZADO, "REJECTED")


_ESTADOS_CON_AVISO_IN_APP = (EstadoPublicacion.ACTIVO, EstadoPublicacion.RECHAZADO, EstadoPublicacion.PAUSADO)


@dataclass
class _ResultadoBulk:
    vistos: list = field(default_factory=list)
    cambiados: list[int] = field(default_factory=list)
    faltantes: list = field(default_factory=list)
    duenos_afectados: set[int] = field(default_factory=set)
    # (pub_id, dueno_id, titulo) de cada aviso cambiado, para los avisos externos.
    cambiados_info: list[tuple[int, int, str]] = field(default_factory=list)


async def _aplicar_cambios_bulk(db: AsyncSession, admin: ClaimsUsuario, ids: list[int],
                                estado: str, evento: str) -> _ResultadoBulk:
    """Cambia el estado de cada aviso existente y deja su fila de auditoría (sin commit)."""
    from app.models import Publicacion, PublicacionesAudit

    r = _ResultadoBulk()
    admin_id = id_o_none(admin)
    for pid in dict.fromkeys(ids):
        p = await db.get(Publicacion, pid) if isinstance(pid, int) and pid >= 1 else None
        if not p:
            r.faltantes.append(pid)
            continue
        r.vistos.append(pid)
        if p.estado == estado:
            continue
        p.estado = estado
        db.add(PublicacionesAudit(
            publicacion_id=pid,
            usuario_id=admin_id,
            evento=evento,
            detalle=f"Cambio masivo a {estado} por admin",
        ))
        r.cambiados.append(pid)
        try:
            r.duenos_afectados.add(int(p.usuario_id))
            r.cambiados_info.append((pid, int(p.usuario_id), str(p.titulo or f"aviso {pid}")))
        except (TypeError, ValueError):
            pass
    return r


async def _notificar_bulk_in_app(db: AsyncSession, cambiados: list[int], estado: str) -> None:
    """Fan-out por aviso cambiado (bulk acotado a 50 por schema): una query trae las
    relaciones; cada aviso usa su savepoint aislado y nada tumba el commit."""
    from app.models import Publicacion

    if estado not in _ESTADOS_CON_AVISO_IN_APP or not cambiados:
        return
    filas = (await db.execute(
        select(Publicacion).options(
            selectinload(Publicacion.servicios),
            selectinload(Publicacion.campus_links),
        ).where(Publicacion.id.in_(cambiados))
    )).scalars().all()
    for fila in filas:
        await _notificar_moderacion_in_app(db, fila, estado)


async def _avisar_duenos_externo(db: AsyncSession, cambiados_info: list[tuple[int, int, str]],
                                 estado: str) -> int:
    """Avisos fuera de la app (best-effort, tras el commit), en paralelo con tope
    de 5 para no saturar la Bot API. Devuelve cuántos dueños se notificaron."""
    semaforo = asyncio.Semaphore(5)

    async def _uno(dueno, titulo):
        async with semaforo:
            try:
                return await _notificar_dueno_estado(db, dueno, titulo, estado)
            except Exception as e:
                logger.warning("[admin bulk] aviso externo al dueño %s falló: %s", dueno, exc_resumen(e))
                return "none"

    try:
        resultados = await asyncio.gather(
            *[_uno(dueno, titulo) for _pid, dueno, titulo in cambiados_info],
            return_exceptions=True,
        )
    except Exception as e:
        logger.warning("[admin bulk] avisos externos fallaron: %s", exc_resumen(e))
        return 0
    return sum(1 for r in resultados if r != "none" and not isinstance(r, Exception))


async def _bulk_cambiar_estado(db: AsyncSession, admin: ClaimsUsuario, ids: list[int],
                               estado: str, evento: str) -> dict:
    """Cambio masivo con democión por dueño en la misma transacción.

    Un bulk-reject total no debe dejar a un ARRENDADOR con 0 vigentes sin
    democionar (igual que los endpoints individuales): se evalúa la democión
    de cada dueño afectado con row-lock antes del commit.
    """
    try:
        r = await _aplicar_cambios_bulk(db, admin, ids, estado, evento)
        democionados = [d for d in sorted(r.duenos_afectados) if await _evaluar_democion_dueno(db, d)]
        await _notificar_bulk_in_app(db, r.cambiados, estado)
        await db.commit()
        notificados = await _avisar_duenos_externo(db, r.cambiados_info, estado)
        return {"estado": estado, "solicitados": len(ids), "cambiados": r.cambiados,
                "sin_cambios": [i for i in r.vistos if i not in r.cambiados],
                "no_encontrados": r.faltantes, "democionados": democionados,
                "notificados": notificados}
    except Exception as e:
        await rollback_seguro(db, "_bulk_cambiar_estado")
        logger.error(f"[DB fallback] bulk {estado} falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
