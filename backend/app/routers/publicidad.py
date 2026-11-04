"""routers/publicidad.py - Módulo Publicidad AlojaU v1 (planes + destacados).

Endpoints:
  GET   /api/publicidad/planes              público (catálogo 7/15/30d)
  POST  /api/publicidad/destacar            ARRENDADOR dueño + Idempotency-Key -> 201 PENDIENTE
  GET   /api/publicidad/mias                dueño: historial y estado
  GET   /api/admin/publicidad/pendientes    ADMIN: bandeja PENDIENTE
  PATCH /api/admin/publicidad/{id}          ADMIN: aprobar->ACTIVO / rechazar->RECHAZADO (+audit)

Reglas v1: solo pub ACTIVO del dueño, sin destacado vigente (PENDIENTE o
ACTIVO con vence futuro) -> 409, vence = now + plan.dias. Pago manual:
pago_ref + aprobación admin. Historial nunca se borra (VENCIDO/RECHAZADO
no bloquean un nuevo intento). Idempotencia: mismo patrón que
POST /api/publicaciones (tabla idempotency_keys, ruta propia).
"""
from datetime import datetime, timezone, timedelta
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.core.security import require_admin, require_arrendador, id_propietario, ClaimsUsuario
from app.db.session import get_session
from app.services import idempotencia
from app.schemas.publicidad import (
    AdminDecisionIn,
    DestacarIn,
    DestacadoOut,
    PlanOut,
)
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoDestacado, EstadoPublicacion

logger = logging.getLogger("alojau.publicidad")

router = APIRouter(prefix="/api/publicidad", tags=["publicidad"])
router_admin = APIRouter(prefix="/api/admin/publicidad", tags=["admin-publicidad"])


# --- Idempotencia (espejo de POST publicar; ruta propia en la PK) ---
IDEM_RUTA_DESTACAR = "POST /api/publicidad/destacar"


def _destacado_out(d, plan_nombre: str | None = None) -> dict:
    get = (lambda k: d.get(k)) if isinstance(d, dict) else (lambda k: getattr(d, k))
    return {
        "id": get("id"),
        "publicacion_id": get("publicacion_id"),
        "plan_id": get("plan_id"),
        "plan_nombre": plan_nombre,
        "inicia": get("inicia"),
        "vence": get("vence"),
        "estado": get("estado"),
        "pago_ref": get("pago_ref"),
        "created_by": get("created_by"),
        "created_at": get("created_at"),
    }


@router.get("/planes", response_model=list[PlanOut], summary="Catálogo público de planes")
async def listar_planes(db: AsyncSession = Depends(get_session)):
    """Planes activos ordenados por días (7/15/30). Sin auth."""
    try:
        from app.models import PlanPublicidad

        rows = (await db.execute(
            select(PlanPublicidad)
            .where(PlanPublicidad.activo.is_(True))
            .order_by(PlanPublicidad.dias.asc())
        )).scalars().all()
        return [
            {"id": p.id, "nombre": p.nombre, "dias": p.dias,
             "precio_cop": p.precio_cop, "prioridad": p.prioridad, "activo": p.activo}
            for p in rows
        ]
    except Exception as e:
        logger.error(f"[DB fallback] planes falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "listar_planes")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


async def _validar_destacable(db: AsyncSession, payload, uid: int):
    """Plan activo y aviso propio en estado ACTIVO; devuelve (plan, publicación)."""
    from app.models import PlanPublicidad, Publicacion

    plan = await db.get(PlanPublicidad, payload.plan_id)
    if not plan or not plan.activo:
        raise HTTPException(status_code=404, detail="Plan no encontrado o inactivo")
    pub = await db.get(Publicacion, payload.publicacion_id)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if int(pub.usuario_id) != int(uid):
        raise HTTPException(status_code=403, detail="Solo el dueño puede destacar su aviso")
    if pub.estado != EstadoPublicacion.ACTIVO:
        raise HTTPException(status_code=409, detail="Solo se puede destacar una publicación ACTIVO")
    return plan, pub


async def _tiene_destacado_vigente(db: AsyncSession, pub_id: int, ahora: datetime) -> bool:
    from app.models import PublicacionDestacado

    vigentes = (await db.execute(
        select(func.count()).select_from(PublicacionDestacado).where(
            PublicacionDestacado.publicacion_id == pub_id,
            PublicacionDestacado.estado.in_([EstadoDestacado.PENDIENTE, EstadoDestacado.ACTIVO]),
            PublicacionDestacado.vence > ahora,
        )
    )).scalar() or 0
    return bool(vigentes)


@router.post("/destacar", response_model=DestacadoOut, status_code=status.HTTP_201_CREATED,
             summary="Destacar aviso propio (ARRENDADOR, dueño, pub ACTIVO)")
async def destacar(
    payload: DestacarIn,
    user: ClaimsUsuario = Depends(require_arrendador),
    db: AsyncSession = Depends(get_session),
    idempotency_key: Optional[str] = Header(None),
):
    """Crea un destacado PENDIENTE (pago manual v1: pago_ref + aprobación admin).

    401 sin token/id, 403 si no es dueño, 404 pub/plan inexistente o plan
    inactivo, 409 si la pub no está ACTIVO o ya tiene destacado vigente.
    Misma Idempotency-Key -> replay del primer 201 (sin duplicar).
    """
    uid = id_propietario(user)
    clave = idempotencia.validar_clave(idempotency_key)
    if clave:
        previo = await idempotencia.respuesta_previa(db, clave, uid, IDEM_RUTA_DESTACAR)
        if previo is not None:
            return previo["cuerpo"]
    try:
        from app.models import PublicacionDestacado

        plan, pub = await _validar_destacable(db, payload, uid)
        ahora = datetime.now(timezone.utc)
        if await _tiene_destacado_vigente(db, pub.id, ahora):
            raise HTTPException(status_code=409, detail="La publicación ya tiene un destacado vigente")
        d = PublicacionDestacado(
            publicacion_id=pub.id, plan_id=plan.id,
            inicia=ahora, vence=ahora + timedelta(days=int(plan.dias)),
            estado=EstadoDestacado.PENDIENTE, pago_ref=(payload.pago_ref or None),
            created_by=uid,
        )
        db.add(d)
        await db.commit()
        await db.refresh(d)
        resp = _destacado_out(d, plan.nombre)
        if clave:
            ganador = await idempotencia.guardar_respuesta(db, clave, uid, IDEM_RUTA_DESTACAR, resp)
            if ganador is not None:
                return ganador["cuerpo"]
        return resp
    except HTTPException:
        await rollback_seguro(db, "destacar")
        raise
    except Exception as e:
        await rollback_seguro(db, "destacar")
        logger.error(f"[DB fallback] destacar falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/mias", response_model=list[DestacadoOut], summary="Dueño: mis destacados (historial y estado)")
async def mis_destacados(
    user: ClaimsUsuario = Depends(require_arrendador),
    db: AsyncSession = Depends(get_session),
):
    """Destacados creados por el dueño, más recientes primero. Sin token -> 401."""
    uid = id_propietario(user)
    try:
        from app.models import PlanPublicidad, PublicacionDestacado

        rows = (await db.execute(
            select(PublicacionDestacado, PlanPublicidad.nombre)
            .join(PlanPublicidad, PlanPublicidad.id == PublicacionDestacado.plan_id)
            .where(PublicacionDestacado.created_by == uid)
            .order_by(PublicacionDestacado.id.desc())
        )).all()
        return [_destacado_out(d, nombre) for d, nombre in rows]
    except Exception as e:
        logger.error(f"[DB fallback] mias publicidad falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "mis_destacados")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router_admin.get("/pendientes", response_model=list[DestacadoOut], summary="Admin: destacados PENDIENTE")
async def pendientes(
    admin: ClaimsUsuario = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    """Bandeja de aprobación (más antiguos primero). Solo ADMIN (401/403)."""
    try:
        from app.models import PlanPublicidad, PublicacionDestacado

        rows = (await db.execute(
            select(PublicacionDestacado, PlanPublicidad.nombre)
            .join(PlanPublicidad, PlanPublicidad.id == PublicacionDestacado.plan_id)
            .where(PublicacionDestacado.estado == EstadoDestacado.PENDIENTE)
            .order_by(PublicacionDestacado.id.asc())
        )).all()
        return [_destacado_out(d, nombre) for d, nombre in rows]
    except Exception as e:
        logger.error(f"[DB fallback] pendientes publicidad falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "pendientes")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router_admin.post("/vencer", summary="Admin: job vencimiento de destacados")
async def vencer(
    admin: ClaimsUsuario = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    """Marca VENCIDO los destacados con vence pasado (PENDIENTE/ACTIVO).

    Job diario (cron o manual): UPDATE masivo, sin borrar historial,
    idempotente (sin vencidos -> {"vencidos": 0}). Solo ADMIN (401/403).
    Patrón POST /evaluar de admin_automation.
    """
    try:
        from app.services import publicidad as _svc

        n = await _svc.vencer_destacados(db)
        return {"vencidos": n}
    except Exception as e:
        logger.error(f"[DB fallback] vencer destacados falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "vencer")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router_admin.patch("/{destacado_id}", response_model=DestacadoOut, summary="Admin: aprobar o rechazar destacado")
async def decidir(
    destacado_id: int = Path(..., ge=1, le=1000000),
    payload: AdminDecisionIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """aprobar->ACTIVO (+audit APPROVED), rechazar->RECHAZADO (+REJECTED).

    404 si no existe, 409 si ya fue procesado (no-PENDIENTE) o si al aprobar
    colisiona con otro ACTIVO vigente (unique parcial).
    """
    try:
        from app.models import PlanPublicidad, Publicacion, PublicacionDestacado, PublicacionesAudit

        d = await db.get(PublicacionDestacado, destacado_id)
        if not d:
            raise HTTPException(status_code=404, detail="Destacado no encontrado")
        if d.estado != EstadoDestacado.PENDIENTE:
            raise HTTPException(status_code=409, detail=f"El destacado ya fue procesado ({d.estado})")
        if payload.accion == "aprobar":
            vence = d.vence
            if getattr(vence, "tzinfo", None) is None:
                vence = vence.replace(tzinfo=timezone.utc)
            if vence <= datetime.now(timezone.utc):
                raise HTTPException(status_code=409, detail="El destacado ya venció")
            pub = await db.get(Publicacion, d.publicacion_id)
            if not pub or pub.estado != EstadoPublicacion.ACTIVO:
                raise HTTPException(status_code=409, detail="La publicación ya no está ACTIVO")
        if payload.accion == "aprobar":
            d.estado, evento = EstadoDestacado.ACTIVO, "APPROVED"
        else:
            d.estado, evento = EstadoDestacado.RECHAZADO, "REJECTED"
        db.add(PublicacionesAudit(
            publicacion_id=d.publicacion_id,
            usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
            evento=evento,
            detalle=f"Publicidad: destacado {d.id} {payload.accion} por admin",
        ))
        try:
            await db.commit()
        except IntegrityError:
            await rollback_seguro(db, "decidir")
            raise HTTPException(status_code=409, detail="La publicación ya tiene un destacado ACTIVO vigente")
        await db.refresh(d)
        plan = await db.get(PlanPublicidad, d.plan_id)
        return _destacado_out(d, plan.nombre if plan else None)
    except HTTPException:
        await rollback_seguro(db, "decidir")
        raise
    except Exception as e:
        _id_seguro = str(destacado_id).replace("\n", "").replace("\r", "")
        logger.error(f"[DB fallback] decidir destacado {_id_seguro} falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "decidir")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
