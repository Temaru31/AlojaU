"""Edición del dueño: datos, fotos, renovación, pausa/reanudación y borrado."""
import logging
from fastapi import APIRouter
from fastapi import Depends, Path, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PublicacionCardOut, PublicacionUpdate, RenovacionOut
from pydantic import BaseModel, Field
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion
from app.core.security import es_dueno_o_admin
from app.routers.publicaciones.comun import _exigir_tipo_activo, select_con_relaciones

logger = logging.getLogger("alojau.publicaciones")
router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])

async def _exigir_servicios_existentes(db: AsyncSession, servicios_ids: list[int]) -> None:
    from app.models import ServicioCatalogo

    for sid in servicios_ids:
        if not await db.get(ServicioCatalogo, sid):
            raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")


async def _reemplazar_servicios(db: AsyncSession, pub_id: int, servicios_ids: list[int]) -> None:
    """Reemplazo total de las etiquetas del aviso (sin commit)."""
    from app.models import PublicacionServicio

    await db.execute(
        PublicacionServicio.__table__.delete().where(
            PublicacionServicio.publicacion_id == pub_id)
    )
    for sid in servicios_ids:
        db.add(PublicacionServicio(publicacion_id=pub_id, servicio_id=sid))


async def _tarjeta_recien_editada(db: AsyncSession, p) -> PublicacionCardOut:
    """Relee el aviso con sus relaciones (refresh() no las recarga en async) y arma la tarjeta.

    La sesión usa expire_on_commit=False: el DELETE Core no invalida la
    colección ORM en el identity map y el re-read la traería rancia, así que
    se expira explícitamente. AsyncSession.expire es síncrono (sin await).
    """
    from app.models import Publicacion

    db.expire(p, ["servicios"])
    stmt = select_con_relaciones().where(Publicacion.id == p.id)
    p = (await db.execute(stmt)).scalars().unique().one()
    rep_map, users_map, _ = await repo.fetch_page_aggregates(db, [p], None)
    return view.cards_for_page([p], rep_map, users_map, {}, None, True)[0]


@router.patch("/{pub_id}", response_model=PublicacionCardOut, summary="UX Editar aviso del dueño (solo owner/ADMIN)")
async def editar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: PublicacionUpdate = ...,
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """Edición parcial del dueño: escalares + `servicios_ids` opcional
    (reemplazo total de etiquetas, con FK validadas). Las fotos van por
    PATCH /{id}/fotos (reconciliación atómica, M4).
    401 sin token o sin id válido, 403 si no es dueño ni ADMIN, 404 si no existe,
    422 si algún campo viola cotas (iguales a Create) o el body viene vacío.
    El estado NO cambia con la edición. Sin fila de audit: el CHECK de
    publicaciones_audit no tiene evento EDITED (migración pendiente)."""
    cambios = {k: v for k, v in payload.model_dump().items() if v is not None}
    servicios_nuevos = cambios.pop("servicios_ids", None)
    if servicios_nuevos is not None:
        servicios_nuevos = list(dict.fromkeys(servicios_nuevos))
    # Commit único: el set de fotos viaja en el mismo PATCH (ya validado
    # por el schema). Un solo commit para escalares + etiquetas + fotos.
    fotos_nuevas = cambios.pop("fotos", None)
    # Si cambia el tipo, validar contra housing_types (esta_activo=true).
    if "tipo_inmueble" in cambios:
        await _exigir_tipo_activo(db, cambios["tipo_inmueble"], "tipo_inmueble")
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, p.usuario_id, db):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar")
        if servicios_nuevos is not None:
            await _exigir_servicios_existentes(db, servicios_nuevos)
        for k, v in cambios.items():
            setattr(p, k, v)
        if servicios_nuevos is not None:
            await _reemplazar_servicios(db, pub_id, servicios_nuevos)
        if fotos_nuevas is not None:
            await _reconciliar_fotos_urls(db, pub_id, list(fotos_nuevas))
        await db.commit()
        return await _tarjeta_recien_editada(db, p)
    except HTTPException:
        await rollback_seguro(db, "editar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] editar {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "editar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


async def _reconciliar_fotos_urls(db: AsyncSession, pub_id: int, urls: list[str]) -> list:
    """Alta/baja/reorden de fotos en UNA pasada (sin commit).

    Fuente única para PATCH /{id} (campo `fotos`) y PATCH /{id}/fotos.
    Las URLs ya vienen normalizadas y validadas. Usa orden temporal 1000+i
    para no violar UNIQUE(publicacion_id, orden) a mitad de camino.
    Retorna las filas finales ordenadas por orden.
    """
    from app.models import ImagenPublicacion

    actuales = (await db.execute(
        select(ImagenPublicacion).where(
            ImagenPublicacion.publicacion_id == pub_id)
    )).scalars().all()
    por_url = {r.url: r for r in actuales}
    vistas = set(urls)
    for r in actuales:
        if r.url not in vistas:
            await db.delete(r)
    await db.flush()
    vivas = [por_url[u] for u in urls if u in por_url]
    for i, row in enumerate(vivas):
        row.orden = 1000 + i
    await db.flush()
    for i, url in enumerate(urls, start=1):
        row = por_url.get(url)
        if row is not None and url in vistas:
            row.orden = i
        else:
            db.add(ImagenPublicacion(publicacion_id=pub_id, url=url, orden=i))
    await db.flush()
    return (await db.execute(
        select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
        .order_by(ImagenPublicacion.orden.asc())
    )).scalars().all()


class FotosSetIn(BaseModel):
    """Set completo y ordenado de fotos (la posición 0 es la portada)."""
    fotos: list[str] = Field(min_length=1, max_length=10)


@router.patch("/{pub_id}/fotos", summary="Dueño: reemplazar set de fotos (atómico)")
async def reemplazar_fotos(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: FotosSetIn = ...,
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """M4 edición bufferizada: el frontend acumula altas/bajas/reorden en
    estado local y commitea UNA vez aquí (1 transacción: altas + bajas +
    reorden 1..N). Solo dueño o ADMIN. 401/403/404/422.

    Las URLs deben venir de `POST /upload/una` (storage) o externas http(s);
    duplicadas o no-http → 422. Sin fila de audit (sin evento FOTOS en el
    CHECK de auditoría).
    """
    urls = [str(u or "").strip()[:500] for u in (payload.fotos or []) if str(u or "").strip()]
    if not urls:
        raise HTTPException(status_code=422, detail="fotos vacío")
    if len(urls) > 10:
        raise HTTPException(status_code=422, detail="Máximo 10 fotos por aviso")
    if len(set(urls)) != len(urls):
        raise HTTPException(status_code=422, detail="fotos duplicadas")
    for u in urls:
        if not (u.startswith("https://") or u.startswith("http://")):
            raise HTTPException(status_code=422, detail="URLs deben ser http(s)")
    uid = id_propietario(user)
    try:
        from app.models import ImagenPublicacion, Publicacion

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, pub.usuario_id, db):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar fotos")
        await _reconciliar_fotos_urls(db, pub_id, urls)
        await db.commit()
        filas = (await db.execute(
            select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
            .order_by(ImagenPublicacion.orden.asc())
        )).scalars().all()
        return {"id": pub_id,
                "fotos": [r.url for r in filas],
                "imagenes": [{"id": r.id, "url": r.url, "orden": r.orden} for r in filas],
                "total": len(filas)}
    except HTTPException:
        await rollback_seguro(db, "reemplazar_fotos")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] fotos {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "reemplazar_fotos")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch(
    "/{pub_id}/renovar", response_model=RenovacionOut, summary="PA-01 Renovar vigencia 30 días (solo propietario)"
)
async def renovar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """
    PA-01: Renueva la vigencia de una publicación por 30 días calendario exactos.

    Reglas:
    - 401 sin token válido.
    - 403 si el usuario autenticado no es el dueño de la publicación.
    - 404 si la publicación no existe.
    - Vigente:  nueva_expiracion = fecha_expiracion_actual + 30 días.
    - Vencida:  nueva_expiracion = ahora + 30 días.
    - EXPIRADO → pasa a ACTIVO. RECHAZADO/DESACTIVADO conservan su estado.
    - Genera fila en publicaciones_audit con evento='RENEWED'.
    """
    uid = id_propietario(user)
    try:
        datos = await repo.renovar_publicacion(db, pub_id, uid)
        return datos
    except HTTPException:
        await rollback_seguro(db, "renovar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB] renovar_publicacion {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "renovar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.delete(
    "/{pub_id}", status_code=status.HTTP_200_OK, summary="Dueño: eliminar aviso (democión N->0 si queda sin inventario)"
)
async def eliminar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """v13.2: el dueño (o ADMIN) elimina su aviso.

    Misma transacción: DELETE + conteo de vigentes + democión a ESTUDIANTE
    si el inventario llega a 0 (row-lock anti-carreras). Responde el rol
    para que el frontend refresque sin re-login.
    401 sin token/id, 403 si no es dueño ni ADMIN, 404 si no existe.
    """
    from app.services import role_lifecycle as _rl
    uid_token = id_propietario(user)
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, p.usuario_id, db):
            raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar")
        dueno_id = p.usuario_id
        await db.delete(p)
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, dueno_id)
        await db.commit()
        return {"id": pub_id, "eliminada": True, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": "Publicación eliminada." + (
                    " Tu rol volvió a Usuario Base." if democionado else "")}
    except HTTPException:
        await rollback_seguro(db, "eliminar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] eliminar {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "eliminar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


async def _aviso_pausable(db: AsyncSession, pub_id: int, user: ClaimsUsuario):
    """Aviso propio (o ADMIN) en ACTIVO o PAUSADO: 404, 403 o 409 si no."""
    from app.models import Publicacion

    p = await db.get(Publicacion, pub_id)
    if not p:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not await es_dueno_o_admin(user, p.usuario_id, db):
        raise HTTPException(status_code=403, detail="Solo el dueño puede cambiar el estado")
    if p.estado not in (EstadoPublicacion.ACTIVO, EstadoPublicacion.PAUSADO):
        raise HTTPException(
            status_code=409,
            detail=f"No se puede cambiar estado desde {p.estado} (solo ACTIVO<->PAUSADO)",
        )
    return p


@router.patch("/{pub_id}/estado", summary="Dueño: pausar/reanudar aviso (ACTIVO<->PAUSADO)")
async def cambiar_estado_dueno(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: dict = ...,
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """v15.2 switch del arrendador. Solo dueño (o ADMIN).

    Allowlist: ACTIVO <-> PAUSADO y solo desde esos mismos estados (nunca
    desde PENDIENTE/RECHAZADO: eso eludiría la moderación -> 409).
    Misma transacción: estado + audit (PAUSED/RESUMED) + chequeo democión.
    """
    from app.services import role_lifecycle as _rl

    nuevo = (payload or {}).get("estado") if isinstance(payload, dict) else None
    if nuevo not in (EstadoPublicacion.ACTIVO, EstadoPublicacion.PAUSADO):
        raise HTTPException(status_code=422, detail="estado debe ser ACTIVO o PAUSADO")
    uid = id_propietario(user)
    try:
        from app.models import PublicacionesAudit

        p = await _aviso_pausable(db, pub_id, user)
        if p.estado == nuevo:
            return {"id": p.id, "estado": p.estado, "rol": user.get("rol"),
                    "rol_actualizado": False, "mensaje": "Sin cambios."}
        p.estado = nuevo
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=uid,
            evento="PAUSED" if nuevo == EstadoPublicacion.PAUSADO else "RESUMED",
            detalle=f"Cambio a {nuevo} por el dueño",
        ))
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, p.usuario_id)
        await db.commit()
        return {"id": p.id, "estado": nuevo, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": f"Aviso {nuevo.lower()}."}
    except HTTPException:
        await rollback_seguro(db, "cambiar_estado_dueno")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] estado {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "cambiar_estado_dueno")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
