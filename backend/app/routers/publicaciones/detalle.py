"""Detalle público de un aviso, similares de la zona, historial y conteo de vistas."""
import logging
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends, Query, Path, HTTPException, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.routers.publicaciones.comun import select_con_relaciones
from app.db.session import get_session
from app.core.security import get_current_user, get_optional_user, id_propietario, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PublicacionDetailOut
from app.core.db_utils import rollback_seguro
from app.core.net import client_ip
from app.core.rate_limit import registrar_intento_persistente, verificar_intentos_fallidos
from app.core.dominio import EstadoPublicacion, Rol
from app.core.security import es_dueno_o_admin

logger = logging.getLogger("alojau.publicaciones")
router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])

_VISTAS_MEM_LIMIT = 120
_VISTAS_MEM_WINDOW_S = 60.0


async def _db_rate_check_vista(db: AsyncSession, ip: str) -> None:
    """Throttle anti-inflado de vistas (conteo persistente en PG)."""
    try:
        await verificar_intentos_fallidos(db, f"vista:{ip}", limite=_VISTAS_MEM_LIMIT,
                                          ventana_s=int(_VISTAS_MEM_WINDOW_S))
        await registrar_intento_persistente(db, f"vista:{ip}", False)
    except HTTPException:
        raise
    except Exception:
        await rollback_seguro(db, "_db_rate_check_vista")

async def _exigir_detalle_visible(p, dueno, current_user, db: AsyncSession) -> None:
    """404 (sin filtrar existencia) si el aviso no es visible para quien consulta."""
    # Ley 1581: dueño eliminado -> invisible salvo ADMIN
    # (la búsqueda ya los excluye; esto cubre acceso directo por URL).
    if (dueno is not None and getattr(dueno, "eliminado_en", None) is not None
            and not (current_user and current_user.get("rol") == Rol.ADMIN)):
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    # Detalle no-ACTIVO privado.
    if p.estado != EstadoPublicacion.ACTIVO and not await es_dueno_o_admin(current_user, p.usuario_id, db):
        raise HTTPException(status_code=404, detail="Publicación no encontrada")


async def _referencia_campus(db: AsyncSession, pub_id: int, campus_id: int) -> tuple:
    """Distancia y datos del lugar buscado: el mapa del Detalle se sincroniza a ESTE
    punto (sin campus_id se usa la distancia mínima). Devuelve (dist_m, campus_ref)."""
    from app.services.haversine import tiempo_pie_min

    dist_ref, lugar = await repo.fetch_detail_campus_ref(db, pub_id, campus_id)
    return dist_ref, {
        "campus_id": lugar.id,
        "institucion": lugar.institucion,
        "nombre_sede": lugar.nombre_sede,
        "latitud": float(lugar.latitud),
        "longitud": float(lugar.longitud),
        "dist_m": dist_ref,
        "tiempo_pie_min": tiempo_pie_min(dist_ref),
    }


@router.get(
    "/{pub_id}", response_model=PublicacionDetailOut, summary="HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp"
)
async def get_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    campus_id: Optional[int] = Query(
        None,
        ge=1,
        le=1000000,
        description="004 POIs: resuelve campus_ref (distancia a ESTE lugar) para sincronizar el mapa del Detalle",
    ),
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    HU-003: muestra canon, servicios, fotos, zona, condiciones, vigencia
            No expone datos que no deban ser públicos (email propietario, etc)
    HU-007: incluye indice_confianza 0-100 + desglose 40+20+15+15+10 + disclaimer
    HU-008: telefono_whatsapp solo si verificado + whatsapp_url wa.me
    PENDIENTE (y no-ACTIVO) es privado -> 404 salvo owner/admin.
    """
    current_user = await get_optional_user(authorization, db)
    try:
        p, reportes_activos, u, dist_detalle = await repo.fetch_detail_bundle(db, pub_id)
        if p:
            await _exigir_detalle_visible(p, u, current_user, db)
            dist, campus_ref = dist_detalle, None
            if campus_id is not None:
                dist, campus_ref = await _referencia_campus(db, pub_id, campus_id)
            _dest_map = await repo.fetch_destacados_map(db, [p.id])
            _info = _dest_map.get(p.id)
            return view.build_detail(
                p, reportes_activos, u, dist, campus_ref,
                await repo.vistas_publicas(db) or await es_dueno_o_admin(current_user, p.usuario_id, db),
                _info is not None,
                _info["vence"] if _info else None,
            )
    except HTTPException:
        raise
    except Exception as e:
        # CWE-117: pub_id viene del path; sanear CR/LF antes de loguear.
        safe_pub_id = str(pub_id).replace("\r", "").replace("\n", "")
        logger.error(f"[DB fallback] get_publicacion {safe_pub_id} falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "get_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    raise HTTPException(status_code=404, detail="Publicación no encontrada")


@router.get("/{pub_id}/historial", summary="Dueño: historial del aviso")
async def historial_aviso(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: ClaimsUsuario = Depends(get_current_user),
):
    """M4 historial del inmueble: eventos del aviso (creada, pausada,
    aprobada...) en orden cronológico. Solo dueño o ADMIN (401/403/404).
    """
    uid = id_propietario(user)
    try:
        from app.models import Publicacion, PublicacionesAudit

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, pub.usuario_id, db):
            raise HTTPException(status_code=403, detail="Solo el dueño puede ver el historial")
        rows = (await db.execute(
            select(PublicacionesAudit).where(PublicacionesAudit.publicacion_id == pub_id)
            .order_by(PublicacionesAudit.id.asc()).limit(50)
        )).scalars().all()
        return {"id": pub_id, "items": [
            {"id": r.id, "evento": r.evento, "detalle": r.detalle,
             "creado_en": r.creado_en.isoformat() if r.creado_en else None}
            for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] historial {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "historial_aviso")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/{pub_id}/similares", summary="Inmuebles similares en la zona (excluye el actual)")
async def similares(
    pub_id: int = Path(..., ge=1, le=1000000),
    limit: int = Query(4, ge=1, le=12),
    db: AsyncSession = Depends(get_session),
):
    """v15.2 bloque 'similares': misma zona (o barrio libre), ACTIVO, dueño
    activo, ordenados por confianza desc. 404 si el aviso base no existe.

    Detalle #9: excluye avisos del propio dueño (usuario_id != base) — el
    bloque es "alternativas para descubrir", no "mis otros avisos".
    """
    try:
        from app.models import Publicacion

        base = await db.get(Publicacion, pub_id)
        if not base:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        from app.repositories.publicacion_repo import dueno_activo_clause
        from app.repositories import publicacion_repo as _repo
        from app.services import publicacion_view as _view
        conds = [
            Publicacion.id != pub_id,
            Publicacion.estado == EstadoPublicacion.ACTIVO,
            dueno_activo_clause(Publicacion),
            Publicacion.usuario_id != base.usuario_id,
        ]
        if base.zona_barrio_id is not None:
            conds.append(Publicacion.zona_barrio_id == base.zona_barrio_id)
        elif base.barrio_texto:
            conds.append(Publicacion.barrio_texto == base.barrio_texto)
        else:
            return {"items": [], "total": 0}
        stmt = (
            select_con_relaciones()
            .where(*conds)
            .order_by(Publicacion.indice_confianza.desc(), Publicacion.id.asc())
            .limit(limit)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return {"items": [], "total": 0}
        rep_map, users_map, _ = await _repo.fetch_page_aggregates(db, pubs, None)
        mostrar = await _repo.vistas_publicas(db)
        return {"items": _view.cards_for_page(pubs, rep_map, users_map, {}, None, mostrar),
                "total": len(pubs)}
    except HTTPException:
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] similares {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "similares")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/{pub_id}/vista", summary="Contar vista (dedup diaria por IP, anti-inflado)")
async def registrar_vista(
    pub_id: int = Path(..., ge=1, le=1000000),
    request: Request = ...,
    db: AsyncSession = Depends(get_session),
):
    """v15.2 métrica de vistas. Pública (ver vitrinas cuenta como visita).

    Antifraude: 1 conteo por (aviso, IP, día) vía hash SHA256 (nunca la IP
    en claro) + throttle 120/min por IP.
    """
    import hashlib as _hl
    from datetime import date as _date
    ip = client_ip(request)
    await _db_rate_check_vista(db, ip)
    dia = _date.today().isoformat()
    marca = _hl.sha256(f"{ip}|{dia}".encode()).hexdigest()
    try:
        from app.models import Publicacion, VistaDedup

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        ya = (await db.execute(
            select(VistaDedup).where(VistaDedup.publicacion_id == pub_id,
                                     VistaDedup.marca == marca)
        )).scalars().first()
        if ya:
            return {"id": pub_id, "vistas": int(p.vistas or 0), "contada": False}
        db.add(VistaDedup(publicacion_id=pub_id, marca=marca, dia=dia))
        p.vistas = int(p.vistas or 0) + 1
        await db.commit()
        return {"id": pub_id, "vistas": int(p.vistas), "contada": True}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "registrar_vista")
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB vista] {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
