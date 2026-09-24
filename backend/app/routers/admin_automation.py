"""routers/admin_automation.py — Ajustes del Sistema + evaluación de pausa automática.

  GET    /api/admin/automation/settings   (ADMIN: lista system_settings, caché TTL 5min)
  PATCH  /api/admin/automation/settings/{clave} (ADMIN: edita valor tipado, invalida caché)
  POST   /api/admin/automation/evaluar/{pub_id} (ADMIN: pausa-automática por reportes)

Agente DB & Performance: las lecturas usan caché en memoria con TTL de 5
minutos (el catálogo casi no cambia); la escritura la invalida. Sin N+1:
una sola query para toda la tabla (3 filas).
"""

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.session import get_session

router = APIRouter(prefix="/api/admin/automation", tags=["admin-automation"])

# Caché simple en memoria para lecturas de system_settings.
_SETTINGS_TTL_S = 300
_settings_cache: dict = {"ts": 0.0, "payload": None}


def _cache_get():
    if _settings_cache["payload"] is not None and (time.monotonic() - _settings_cache["ts"]) < _SETTINGS_TTL_S:
        return _settings_cache["payload"]
    return None


def _cache_set(payload) -> None:
    _settings_cache["payload"] = payload
    _settings_cache["ts"] = time.monotonic()


def clear_settings_cache() -> None:
    """Invalida el caché (tests + escritura)."""
    _settings_cache["ts"] = 0.0
    _settings_cache["payload"] = None


class SettingOut(BaseModel):
    clave: str
    valor: str
    tipo: str = "int"
    descripcion: str | None = None
    seccion: str = "general"


class SettingPatch(BaseModel):
    valor: str


DEFAULTS = {
    # (valor, tipo, descripcion, seccion). Secciones UI: publicaciones,
    # moderacion, visibilidad. Añadir clave = aparece sola en el panel.
    "dias_vigencia_publicacion": ("30", "int", "Días de vigencia al publicar/renovar", "publicaciones"),
    "max_reportes_para_pausa_automatica": ("3", "int", "Reportes que pausan el aviso", "moderacion"),
    "auto_aprobar_arrendadores_verificados": ("false", "bool", "Auto-aprobar verificados", "moderacion"),
    # v15.2 auto-moderación + UX (ver services/auto_moderation.py).
    "moderacion_automatica": ("false", "bool", "Switch global de moderación automática", "moderacion"),
    "umbral_aprobacion_ia": ("0.85", "float", "Score mínimo (0-1) para auto-aprobar", "moderacion"),
    "dias_desactualizada": ("30", "int", "Días para badge 'Desactualizada'", "publicaciones"),
    "titulo_min": ("10", "int", "Mínimo de caracteres del título", "publicaciones"),
    "titulo_max": ("150", "int", "Máximo de caracteres del título", "publicaciones"),
    "descripcion_min": ("20", "int", "Mínimo de caracteres de la descripción", "publicaciones"),
    "descripcion_max": ("2000", "int", "Máximo de caracteres de la descripción", "publicaciones"),
    "fotos_min_publicar": ("3", "int", "Mínimo de fotos al publicar", "publicaciones"),
    "palabras_prohibidas": ("viagra,casino,cripto,x1000", "str", "Spam separado por comas", "moderacion"),
    # v15.x visibilidad de vistas (False = solo dueño/admin, prudente).
    "vistas_visibles_publico": ("false", "bool", "Mostrar vistas a todo visitante", "visibilidad"),
}


@router.get("/settings", response_model=list[SettingOut], summary="Admin: listar ajustes del sistema")
async def listar_settings(
    db: AsyncSession = Depends(get_session), admin: dict = Depends(require_admin)
):
    """Lista system_settings (ADMIN). TTL 5min en memoria.

    v15.2: unión DEFAULTS + overrides de BD (el admin siempre ve todas las
    claves tunables; la BD solo sobrescribe valores). Sin tabla -> defaults.
    """
    hit = _cache_get()
    if hit is not None:
        return hit
    try:
        from app.models import SystemSetting

        rows = (await db.execute(select(SystemSetting))).scalars().all()
        por_clave = {r.clave: r for r in rows}
        payload = [
            SettingOut(clave=k, valor=por_clave[k].valor if k in por_clave else v,
                       tipo=t, descripcion=d, seccion=s)
            for k, (v, t, d, s) in DEFAULTS.items()
        ]
    except Exception:
        # Fallback a defaults SIN cachear: un fallo transitorio de DB no debe
        # envenenar la caché 5 minutos (hallazgo QA/DB multi-agente).
        return [SettingOut(clave=k, valor=v, tipo=t, descripcion=d, seccion=s) for k, (v, t, d, s) in DEFAULTS.items()]
    _cache_set(payload)
    return payload


@router.patch("/settings/{clave}", response_model=SettingOut, summary="Admin: editar ajuste del sistema")
async def editar_setting(
    clave: str, payload: SettingPatch,
    db: AsyncSession = Depends(get_session), admin: dict = Depends(require_admin)
):
    """Edita un setting con validación de tipo/rango (ADMIN). Invalida el caché."""
    if clave not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"setting '{clave}' desconocido")
    _, tipo, desc, _sec = DEFAULTS[clave]
    if tipo == "int":
        try:
            iv = int(payload.valor)
        except ValueError:
            raise HTTPException(status_code=422, detail="valor debe ser entero")
        if clave == "dias_vigencia_publicacion" and not 1 <= iv <= 365:
            raise HTTPException(status_code=422, detail="vigencia 1..365 días")
        if clave == "max_reportes_para_pausa_automatica" and not 1 <= iv <= 20:
            raise HTTPException(status_code=422, detail="umbral 1..20")
        if clave == "dias_desactualizada" and not 1 <= iv <= 365:
            raise HTTPException(status_code=422, detail="rango 1..365 días")
        if clave in ("titulo_min", "descripcion_min") and not 1 <= iv <= 100:
            raise HTTPException(status_code=422, detail="rango 1..100")
        if clave == "titulo_max" and not 10 <= iv <= 150:
            raise HTTPException(status_code=422, detail="rango 10..150")
        if clave == "descripcion_max" and not 100 <= iv <= 5000:
            raise HTTPException(status_code=422, detail="rango 100..5000")
        if clave == "fotos_min_publicar" and not 1 <= iv <= 10:
            raise HTTPException(status_code=422, detail="rango 1..10")
    if tipo == "float":
        try:
            fv = float(payload.valor)
        except ValueError:
            raise HTTPException(status_code=422, detail="valor debe ser decimal")
        if clave == "umbral_aprobacion_ia" and not 0.0 <= fv <= 1.0:
            raise HTTPException(status_code=422, detail="rango 0..1")
    if tipo == "bool" and payload.valor.lower() not in ("true", "false"):
        raise HTTPException(status_code=422, detail="valor debe ser true|false")
    if tipo == "str" and len(payload.valor) > 2000:
        raise HTTPException(status_code=422, detail="máximo 2000 caracteres")
    try:
        from datetime import datetime, timezone

        from app.models import SystemSetting

        row = (await db.execute(select(SystemSetting).where(SystemSetting.clave == clave))).scalars().first()
        anterior = row.valor if row else None
        if row:
            row.valor = payload.valor
            row.actualizado_en = datetime.now(timezone.utc)
        else:
            # Upsert: si la fila no existe (migración sin defaults), créala.
            db.add(SystemSetting(clave=clave, valor=payload.valor, tipo=tipo, descripcion=desc))
        # M4 historial: el cambio de ajustes queda auditado (misma transacción).
        from app.models import PublicacionesAudit
        db.add(PublicacionesAudit(
            publicacion_id=None,
            usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
            evento="SETTINGS",
            detalle=f"{clave}: {anterior} -> {payload.valor}",
        ))
        await db.commit()
        clear_settings_cache()
        return SettingOut(clave=clave, valor=payload.valor, tipo=tipo, descripcion=desc,
                          seccion=_sec)
    except HTTPException:
        raise
    except Exception as e:
        # v15.2 fix false-200 (V14.0 M1): un fallo de persistencia NUNCA se
        # reporta como éxito. Rollback + 503 ruidoso (sin mock: admin es prod).
        import logging as _logging
        _logging.getLogger("alojau.admin").error("[settings] persistencia falló: %r", e)
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="No se pudo guardar el ajuste")


@router.post("/evaluar/{pub_id}", summary="Admin: evaluar pausa automática por reportes")
async def evaluar_pub(
    pub_id: int, db: AsyncSession = Depends(get_session), admin: dict = Depends(require_admin)
):
    """Si reportes PENDIENTE/CONFIRMADO >= umbral -> PAUSADO_POR_REPORTE + audit PAUSED.

    Umbral desde system_settings (caché 5min), default 3. Idempotente: si ya
    está pausado/rechazado, no hace nada.
    """
    from sqlalchemy import func

    from app.models import Publicacion, PublicacionesAudit, ReportePublicacion, SystemSetting

    try:
        umbral = 3
        row = (await db.execute(select(SystemSetting).where(SystemSetting.clave == "max_reportes_para_pausa_automatica"))).scalars().first()
        if row:
            try:
                umbral = int(row.valor)
            except ValueError:
                umbral = 3
        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        n = (await db.execute(
            select(func.count()).select_from(ReportePublicacion).where(
                ReportePublicacion.publicacion_id == pub_id,
                ReportePublicacion.estado.in_(["PENDIENTE", "CONFIRMADO"]),
            )
        )).scalar() or 0
        if n >= umbral and p.estado == "ACTIVO":
            p.estado = "PAUSADO_POR_REPORTE"
            db.add(PublicacionesAudit(
                publicacion_id=pub_id,
                usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
                evento="PAUSED",
                detalle=f"Pausa automática: {n} reportes >= umbral {umbral}",
            ))
            await db.commit()
            return {"id": pub_id, "evaluado": True, "pausado": True, "reportes": n, "umbral": umbral}
        return {"id": pub_id, "evaluado": True, "pausado": False, "reportes": n, "umbral": umbral}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
