"""Panel admin: métricas globales, bandeja de pendientes y log de auditoría."""
import logging
from fastapi import APIRouter
from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import require_admin, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.db.session import get_session
from app.core.pagination import paginate_params, build_paginated
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PaginatedPublicaciones
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion, EstadoReporte
from app.repositories.metricas_repo import MetricasRepo, get_metricas_repo
from app.routers.admin.esquemas import MetricasOut

logger = logging.getLogger("alojau.admin")
router = APIRouter()

@router.get("/metricas", response_model=MetricasOut, summary="Admin métricas globales")
async def metricas(
    repo_metricas: MetricasRepo = Depends(get_metricas_repo),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Totales para /admin/dashboard. Sin token 401, no-ADMIN 403.
    Excluye cuentas en soft-delete (inventario visible real)."""
    try:
        return MetricasOut(
            total_publicaciones=await repo_metricas.avisos(),
            activas=await repo_metricas.avisos(EstadoPublicacion.ACTIVO),
            pendientes=await repo_metricas.avisos(EstadoPublicacion.PENDIENTE),
            reportes_activos=await repo_metricas.reportes(EstadoReporte.PENDIENTE, EstadoReporte.CONFIRMADO),
            reportes_pendientes=await repo_metricas.reportes(EstadoReporte.PENDIENTE),
            inmuebles_con_reportes=await repo_metricas.inmuebles_con_reportes_pendientes(),
            arrendadores_verificados=await repo_metricas.usuarios(solo_arrendadores_verificados=True),
            total_usuarios=await repo_metricas.usuarios(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] metricas falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(repo_metricas.db, "metricas")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/pendientes", response_model=PaginatedPublicaciones, summary="Admin bandeja PENDIENTE")
async def pendientes(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Avisos PENDIENTE paginados (más recientes primero)."""
    try:
        from app.models import Publicacion

        total = await MetricasRepo(db).avisos_pendientes_de_moderar()
        offset, size_norm = paginate_params(page, size)
        stmt = (
            repo.select_con_relaciones()
            .where(Publicacion.estado == EstadoPublicacion.PENDIENTE)
            .order_by(Publicacion.id.desc())
            .limit(size_norm)
            .offset(offset)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return build_paginated([], total, page, size_norm)
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, pubs, None)
        return build_paginated(view.cards_for_page(pubs, rep_map, users_map, {}, None, True), total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] pendientes falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "pendientes")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


def _mensaje_auditoria_legible(evento: str | None, publicacion_id: int | None, detalle: str | None) -> str:
    """M1 human-readable: convierte el enum crudo + detalle en frase amigable.

    Ej. RENEWED #14 -> "Renovó expiración del aviso #14". Nunca expone JSON crudo.
    Aditivo: si el evento es desconocido, devuelve el detalle limpio o el evento.
    """
    ev = (evento or "").upper()
    pid_txt = f" #{int(publicacion_id)}" if publicacion_id is not None else ""
    mapa = {
        "CREATED": f"Creó el aviso{pid_txt}",
        "APPROVED": f"Aprobó el aviso{pid_txt}",
        "REJECTED": f"Rechazó el aviso{pid_txt}",
        "PAUSED": f"Pausó el aviso{pid_txt}",
        "RESUMED": f"Reanudó el aviso{pid_txt}",
        "RENTED": f"Marcó como arrendado el aviso{pid_txt}",
        "EXPIRED": f"Expiró el aviso{pid_txt}",
        "RENEWED": f"Renovó expiración del aviso{pid_txt}",
        "BLOCKED": f"Bloqueó el aviso{pid_txt}",
        "SETTINGS": "Actualizó ajustes del sistema",
        "CUENTA_DELETE": "Eliminó su cuenta",
    }
    base = mapa.get(ev)
    if base:
        return base
    # Fallback: detalle legible (corta JSON crudo a 140 chars sin llaves).
    det = (detalle or "").strip()
    if det:
        limpio = det.replace("{", "").replace("}", "").replace('"', "").strip()
        return f"{ev.title() if ev else 'Evento'}{pid_txt}: {limpio[:140]}" if limpio else (base or ev or "Evento")
    return base or ev or "Evento"


async def _contexto_auditoria(db: AsyncSession, rows) -> tuple[dict[int, str | None], dict[int, bool]]:
    """Batch por página: 1 query de emails y 1 de avisos existentes (best-effort)."""
    from app.models import Publicacion, Usuario

    email_por_id: dict[int, str | None] = {}
    existe_por_pub: dict[int, bool] = {}
    try:
        uids = sorted({int(r.usuario_id) for r in rows if r.usuario_id is not None})
        if uids:
            ures = await db.execute(
                select(Usuario.id, Usuario.email).where(Usuario.id.in_(uids)))
            email_por_id = {int(i): e for i, e in ures.all()}
        pids = sorted({int(r.publicacion_id) for r in rows if r.publicacion_id is not None})
        if pids:
            pres = await db.execute(
                select(Publicacion.id).where(Publicacion.id.in_(pids)))
            vivos = {int(i) for (i,) in pres.all()}
            existe_por_pub = {pid: (pid in vivos) for pid in pids}
    except Exception as e:
        logger.warning("[admin auditoría] enriquecimiento de emails/publicaciones falló: %s", exc_resumen(e))
    return email_por_id, existe_por_pub


def _item_auditoria(r, email_por_id: dict, existe_por_pub: dict) -> dict:
    pid = r.publicacion_id
    return {
        "id": r.id, "publicacion_id": pid, "usuario_id": r.usuario_id,
        "evento": r.evento, "detalle": r.detalle,
        "creado_en": r.creado_en.isoformat() if r.creado_en else None,
        "usuario_email": email_por_id.get(int(r.usuario_id)) if r.usuario_id is not None else None,
        "publicacion_existe": (existe_por_pub.get(int(pid)) if pid is not None else None),
        "mensaje_legible": _mensaje_auditoria_legible(r.evento, pid, r.detalle),
    }


@router.get("/auditoria", summary="Admin: ver log de auditoría (motivos IA/reglas)")
async def ver_auditoria(
    publicacion_id: int | None = Query(None, ge=1),
    evento: str | None = Query(None, max_length=20),
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """Trazabilidad: por qué se aprobó/rechazó (humano o auto).

    Filtros opcionales por aviso y evento. Solo lectura.

    M1 enriquecido (aditivo, sin romper contrato): cada item incluye
    `usuario_email` (batch 1 query WHERE id IN por página), `publicacion_existe`
    (True si el aviso existe, False si fue eliminado, None si no aplica) y
    `mensaje_legible` (texto humano, ej. "Renovó expiración del aviso #14").
    """
    from app.models import PublicacionesAudit
    from app.core.pagination import paginate_params

    try:
        conds = []
        if publicacion_id:
            conds.append(PublicacionesAudit.publicacion_id == publicacion_id)
        if evento:
            conds.append(PublicacionesAudit.evento == evento)
        total = (await db.execute(
            select(func.count()).select_from(PublicacionesAudit).where(*conds))).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        rows = (await db.execute(
            select(PublicacionesAudit).where(*conds)
            .order_by(PublicacionesAudit.id.desc()).limit(size_norm).offset(offset)
        )).scalars().all()
        email_por_id, existe_por_pub = await _contexto_auditoria(db, rows)
        items = [_item_auditoria(r, email_por_id, existe_por_pub) for r in rows]
        return {"items": items, "total": total, "page": page, "size": size_norm}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "ver_auditoria")
        logger.error(f"[DB fallback] auditoria falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
