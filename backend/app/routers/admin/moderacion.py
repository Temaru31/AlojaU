"""Moderación de avisos: aprobar/rechazar/pausar, borrar y cambios masivos."""
import logging
from fastapi import APIRouter
from fastapi import Depends, HTTPException, Path, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import require_admin
from app.core.logseguro import exc_resumen
from app.db.session import get_session
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PublicacionCardOut
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion
from app.routers.admin.avisos_dueno import ESTADO_A_EVENTO, _evaluar_democion_dueno, _notificar_dueno_estado, _notificar_moderacion_in_app
from app.routers.admin.esquemas import BulkEstadoIn, CambioEstadoIn

logger = logging.getLogger("alojau.admin")
router = APIRouter()

@router.patch("/publicaciones/{pub_id}", response_model=PublicacionCardOut, summary="Admin cambiar estado (aprobar/rechazar/pausar)")
async def cambiar_estado(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: CambioEstadoIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
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
            usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
            evento=ESTADO_A_EVENTO[payload.estado],
            detalle=f"Cambio a {payload.estado} por admin",
        ))
        await _evaluar_democion_dueno(db, p.usuario_id)
        await _notificar_moderacion_in_app(db, p, payload.estado)
        await db.commit()
        dueno_id, titulo = p.usuario_id, p.titulo
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
    admin: dict = Depends(require_admin),
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
    admin: dict = Depends(require_admin),
):
    """v15.2 moderación masiva. Transacción única: estados + audit APPROVED."""
    return await _bulk_cambiar_estado(db, admin, data.ids, EstadoPublicacion.ACTIVO, "APPROVED")


@router.post("/publicaciones/bulk-reject", summary="Admin: rechazar en lote (con audit)")
async def bulk_reject(
    data: BulkEstadoIn,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    """v15.2 moderación masiva. Transacción única: estados + audit REJECTED."""
    return await _bulk_cambiar_estado(db, admin, data.ids, EstadoPublicacion.RECHAZADO, "REJECTED")


async def _bulk_cambiar_estado(db: AsyncSession, admin: dict, ids: list[int],
                               estado: str, evento: str) -> dict:
    """Cambio masivo con democión por dueño en la misma transacción.

    Detalle #1: un bulk-reject total dejaba ARRENDADOR con 0 vigentes sin
    democionar (los endpoints individuales sí lo hacían). Se recoge el set
    de dueños afectados por los cambios y se evalúa democión con row-lock
    antes del commit. Retorna además `democionados: [usuario_ids]`.
    """
    from app.models import Publicacion, PublicacionesAudit

    vistos, cambiados, faltantes = [], [], []
    duenos_afectados: set[int] = set()
    cambiados_info: list[tuple[int, int, str]] = []  # (pub_id, dueno_id, titulo)
    try:
        for pid in dict.fromkeys(ids):
            if not isinstance(pid, int) or pid < 1:
                faltantes.append(pid)
                continue
            p = await db.get(Publicacion, pid)
            if not p:
                faltantes.append(pid)
                continue
            vistos.append(pid)
            if p.estado == estado:
                continue
            p.estado = estado
            db.add(PublicacionesAudit(
                publicacion_id=pid,
                usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
                evento=evento,
                detalle=f"Cambio masivo a {estado} por admin",
            ))
            cambiados.append(pid)
            try:
                duenos_afectados.add(int(p.usuario_id))
                cambiados_info.append((pid, int(p.usuario_id), str(p.titulo or f"aviso {pid}")))
            except (TypeError, ValueError):
                pass
        # Misma transacción: flush de estados + democión N->0 por dueño.
        democionados = [d for d in sorted(duenos_afectados) if await _evaluar_democion_dueno(db, d)]
        # Fan-out por aviso aprobado (bulk acotado a 50 por schema)
        # + aviso de moderación al dueño ante cualquier cambio (ACTIVO,
        # RECHAZADO, PAUSADO). Una query trae relaciones; cada aviso usa su
        # savepoint aislado y nada tumba el commit.
        if estado in (EstadoPublicacion.ACTIVO, EstadoPublicacion.RECHAZADO, EstadoPublicacion.PAUSADO) and cambiados:
            filas = (await db.execute(
                select(Publicacion).options(
                    selectinload(Publicacion.servicios),
                    selectinload(Publicacion.campus_links),
                ).where(Publicacion.id.in_(cambiados))
            )).scalars().all()
            for fila in filas:
                await _notificar_moderacion_in_app(db, fila, estado)
        await db.commit()
        # Avisos fuera de la app (best-effort, tras el commit, en paralelo
        # con tope de 5 para no saturar la Bot API).
        notificados = 0
        try:
            import asyncio as _asyncio
            _semaforo = _asyncio.Semaphore(5)

            async def _uno(_dueno, _titulo):
                async with _semaforo:
                    try:
                        return await _notificar_dueno_estado(db, _dueno, _titulo, estado)
                    except Exception as e:
                        logger.warning("[admin bulk] aviso externo al dueño %s falló: %s", _dueno, exc_resumen(e))
                        return "none"

            resultados = await _asyncio.gather(
                *[_uno(_d, _t) for _p, _d, _t in cambiados_info],
                return_exceptions=True,
            )
            notificados = sum(1 for r in resultados if r != "none" and not isinstance(r, Exception))
        except Exception as e:
            logger.warning("[admin bulk] avisos externos fallaron: %s", exc_resumen(e))
        return {"estado": estado, "solicitados": len(ids), "cambiados": cambiados,
                "sin_cambios": [i for i in vistos if i not in cambiados],
                "no_encontrados": faltantes, "democionados": democionados,
                "notificados": notificados}
    except Exception as e:
        await rollback_seguro(db, "_bulk_cambiar_estado")
        logger.error(f"[DB fallback] bulk {estado} falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
