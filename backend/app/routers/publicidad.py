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
import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.core.security import require_admin, require_arrendador
from app.db.session import get_session
from app.schemas.publicidad import (
    AdminDecisionIn,
    DestacarIn,
    DestacadoOut,
    PlanOut,
)
from app.core.db_utils import rollback_seguro
from app.core.flags import mock_enabled
from app.core.dominio import EstadoDestacado, EstadoPublicacion
from app.services.publicidad_demo import (
    MOCK_DESTACADOS, MOCK_PLANES, _mock_plan, _mock_vigente, mock_destacados_map,
)
from app.fixtures.publicaciones_demo import MOCK_PUBS

logger = logging.getLogger("alojau.publicidad")

router = APIRouter(prefix="/api/publicidad", tags=["publicidad"])
router_admin = APIRouter(prefix="/api/admin/publicidad", tags=["admin-publicidad"])


# --- Idempotencia (espejo de POST publicar; ruta propia en la PK) ---
IDEM_RUTA_DESTACAR = "POST /api/publicidad/destacar"
IDEM_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
IDEM_TTL_HORAS = 24
_IDEMPOTENCY_MOCK: dict[tuple[str, int, str], dict] = {}


def _idem_validar(clave: str | None) -> str | None:
    if clave is None or not isinstance(clave, str):
        return None
    clave = clave.strip()
    if not clave:
        return None
    if not IDEM_RE.match(clave):
        raise HTTPException(status_code=422, detail="Idempotency-Key inválida (8-64 [A-Za-z0-9_-])")
    return clave


async def _idem_replay(db: AsyncSession, clave: str, uid: int) -> dict | None:
    try:
        from app.models import IdempotencyKey
        row = await db.get(IdempotencyKey, (clave, uid, IDEM_RUTA_DESTACAR))
        if row is None:
            return None
        exp = row.expira_en
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None
        return {"codigo": int(row.codigo), "cuerpo": dict(row.cuerpo)}
    except HTTPException:
        raise
    except Exception:
        await rollback_seguro(db, "_idem_replay")
        if not mock_enabled():
            return None
    hit = _IDEMPOTENCY_MOCK.get((clave, uid, IDEM_RUTA_DESTACAR))
    if not hit:
        return None
    if hit["expira_en"] <= datetime.now(timezone.utc):
        return None
    return {"codigo": hit["codigo"], "cuerpo": dict(hit["cuerpo"])}


async def _idem_guardar(db: AsyncSession, clave: str, uid: int, cuerpo: dict) -> dict | None:
    import json as _json
    limpio = _json.loads(_json.dumps(cuerpo, default=str))
    expira = datetime.now(timezone.utc) + timedelta(hours=IDEM_TTL_HORAS)
    try:
        from app.models import IdempotencyKey
        try:
            await db.execute(
                IdempotencyKey.__table__.delete().where(
                    IdempotencyKey.expira_en < datetime.now(timezone.utc))
            )
        except Exception as e:
            logger.warning("[idempotencia] limpieza de claves vencidas falló: %s", exc_resumen(e))
        db.add(IdempotencyKey(
            clave=clave, usuario_id=uid, ruta=IDEM_RUTA_DESTACAR,
            codigo=201, cuerpo=limpio, expira_en=expira,
        ))
        await db.commit()
        return None
    except IntegrityError:
        await rollback_seguro(db, "_idem_guardar")
        return await _idem_replay(db, clave, uid)
    except Exception as e:
        await rollback_seguro(db, "_idem_guardar")
        logger.warning(f"[idempotencia] destacar no se pudo guardar: {exc_resumen(e)}")
        if not mock_enabled():
            return None
    _IDEMPOTENCY_MOCK[(clave, uid, IDEM_RUTA_DESTACAR)] = {
        "codigo": 201, "cuerpo": limpio, "expira_en": expira,
    }
    return None




def clear_publicidad_mock_for_tests() -> None:
    MOCK_DESTACADOS.clear()
    _IDEMPOTENCY_MOCK.clear()


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
    """Planes activos ordenados por días (7/15/30). Sin auth, nunca 503 en mock."""
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
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return [dict(p) for p in MOCK_PLANES if p["activo"]]


@router.post("/destacar", response_model=DestacadoOut, status_code=status.HTTP_201_CREATED,
             summary="Destacar aviso propio (ARRENDADOR, dueño, pub ACTIVO)")
async def destacar(
    payload: DestacarIn,
    user: dict = Depends(require_arrendador),
    db: AsyncSession = Depends(get_session),
    idempotency_key: Optional[str] = Header(None),
):
    """Crea un destacado PENDIENTE (pago manual v1: pago_ref + aprobación admin).

    401 sin token/id, 403 si no es dueño, 404 pub/plan inexistente o plan
    inactivo, 409 si la pub no está ACTIVO o ya tiene destacado vigente.
    Misma Idempotency-Key -> replay del primer 201 (sin duplicar).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    clave = _idem_validar(idempotency_key)
    if clave:
        previo = await _idem_replay(db, clave, uid)
        if previo is not None:
            return previo["cuerpo"]
    try:
        from app.models import PlanPublicidad, Publicacion, PublicacionDestacado

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
        ahora = datetime.now(timezone.utc)
        vigentes = (await db.execute(
            select(func.count()).select_from(PublicacionDestacado).where(
                PublicacionDestacado.publicacion_id == pub.id,
                PublicacionDestacado.estado.in_([EstadoDestacado.PENDIENTE, EstadoDestacado.ACTIVO]),
                PublicacionDestacado.vence > ahora,
            )
        )).scalar() or 0
        if vigentes:
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
            ganador = await _idem_guardar(db, clave, uid, resp)
            if ganador is not None:
                return ganador["cuerpo"]
        return resp
    except HTTPException:
        await rollback_seguro(db, "destacar")
        raise
    except Exception as e:
        await rollback_seguro(db, "destacar")
        logger.error(f"[DB fallback] destacar falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev: espejo con MOCK_PUBS (mismas reglas).

    plan = _mock_plan(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado o inactivo")
    pub = next((p for p in MOCK_PUBS if p["id"] == payload.publicacion_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if pub.get("usuario_id") != uid:
        raise HTTPException(status_code=403, detail="Solo el dueño puede destacar su aviso")
    if pub.get("estado") != EstadoPublicacion.ACTIVO:
        raise HTTPException(status_code=409, detail="Solo se puede destacar una publicación ACTIVO")
    if _mock_vigente(pub["id"]):
        raise HTTPException(status_code=409, detail="La publicación ya tiene un destacado vigente")
    ahora = datetime.now(timezone.utc)
    nuevo = {
        "id": max([d["id"] for d in MOCK_DESTACADOS] + [1000]) + 1,
        "publicacion_id": pub["id"], "plan_id": plan["id"], "plan_nombre": plan["nombre"],
        "inicia": ahora, "vence": ahora + timedelta(days=int(plan["dias"])),
        "estado": EstadoDestacado.PENDIENTE, "pago_ref": payload.pago_ref or None,
        "created_by": uid, "created_at": ahora,
    }
    MOCK_DESTACADOS.append(nuevo)
    resp_mock = dict(nuevo)
    if clave:
        _IDEMPOTENCY_MOCK[(clave, uid, IDEM_RUTA_DESTACAR)] = {
            "codigo": 201, "cuerpo": dict(resp_mock),
            "expira_en": ahora + timedelta(hours=IDEM_TTL_HORAS),
        }
    return resp_mock


@router.get("/mias", response_model=list[DestacadoOut], summary="Dueño: mis destacados (historial y estado)")
async def mis_destacados(
    user: dict = Depends(require_arrendador),
    db: AsyncSession = Depends(get_session),
):
    """Destacados creados por el dueño, más recientes primero. Sin token -> 401."""
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
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
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return [d for d in sorted(MOCK_DESTACADOS, key=lambda x: x["id"], reverse=True)
            if d.get("created_by") == uid]


@router_admin.get("/pendientes", response_model=list[DestacadoOut], summary="Admin: destacados PENDIENTE")
async def pendientes(
    admin: dict = Depends(require_admin),
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
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return [d for d in sorted(MOCK_DESTACADOS, key=lambda x: x["id"])
            if d.get("estado") == EstadoDestacado.PENDIENTE]


@router_admin.post("/vencer", summary="Admin: job vencimiento de destacados")
async def vencer(
    admin: dict = Depends(require_admin),
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
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    ahora = datetime.now(timezone.utc)
    n = 0
    for d in MOCK_DESTACADOS:
        vence = d.get("vence")
        if getattr(vence, "tzinfo", None) is None:
            vence = vence.replace(tzinfo=timezone.utc)
        if d.get("estado") in (EstadoDestacado.PENDIENTE, EstadoDestacado.ACTIVO) and vence <= ahora:
            d["estado"] = EstadoDestacado.VENCIDO
            n += 1
    return {"vencidos": n}


@router_admin.patch("/{destacado_id}", response_model=DestacadoOut, summary="Admin: aprobar o rechazar destacado")
async def decidir(
    destacado_id: int = Path(..., ge=1, le=1000000),
    payload: AdminDecisionIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
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
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    d = next((x for x in MOCK_DESTACADOS if x["id"] == destacado_id), None)
    if not d:
        raise HTTPException(status_code=404, detail="Destacado no encontrado")
    if d["estado"] != EstadoDestacado.PENDIENTE:
        raise HTTPException(status_code=409, detail=f"El destacado ya fue procesado ({d['estado']})")
    if payload.accion == "aprobar":

        vence = d.get("vence")
        if getattr(vence, "tzinfo", None) is None:
            vence = vence.replace(tzinfo=timezone.utc)
        if vence <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="El destacado ya venció")
        pub = next((p for p in MOCK_PUBS if p["id"] == d["publicacion_id"]), None)
        if not pub or pub.get("estado") != EstadoPublicacion.ACTIVO:
            raise HTTPException(status_code=409, detail="La publicación ya no está ACTIVO")
    d["estado"] = EstadoDestacado.ACTIVO if payload.accion == "aprobar" else EstadoDestacado.RECHAZADO
    return dict(d)
