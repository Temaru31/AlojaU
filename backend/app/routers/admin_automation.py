"""routers/admin_automation.py — Ajustes del Sistema (005) + evaluar (Tarea 3).

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

# Tarea 3: caché simple en memoria para lecturas de system_settings.
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


class SettingPatch(BaseModel):
    valor: str


DEFAULTS = {
    "dias_vigencia_publicacion": ("30", "int", "Días de vigencia al publicar/renovar"),
    "max_reportes_para_pausa_automatica": ("3", "int", "Reportes que pausan el aviso"),
    "auto_aprobar_arrendadores_verificados": ("false", "bool", "Auto-aprobar verificados"),
}


@router.get("/settings", response_model=list[SettingOut], summary="Admin: listar ajustes del sistema")
async def listar_settings(
    db: AsyncSession = Depends(get_session), admin: dict = Depends(require_admin)
):
    """Lista system_settings (ADMIN). TTL 5min en memoria; sin tabla -> defaults (sin cachear)."""
    hit = _cache_get()
    if hit is not None:
        return hit
    try:
        from app.models import SystemSetting

        rows = (await db.execute(select(SystemSetting))).scalars().all()
        payload = [SettingOut(clave=r.clave, valor=r.valor, tipo=r.tipo, descripcion=r.descripcion) for r in rows]
        if not payload:
            raise ValueError("tabla vacía")
    except Exception:
        # Fallback a defaults SIN cachear: un fallo transitorio de DB no debe
        # envenenar la caché 5 minutos (hallazgo QA/DB multi-agente).
        return [SettingOut(clave=k, valor=v, tipo=t, descripcion=d) for k, (v, t, d) in DEFAULTS.items()]
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
    _, tipo, desc = DEFAULTS[clave]
    if tipo == "int":
        try:
            iv = int(payload.valor)
        except ValueError:
            raise HTTPException(status_code=422, detail="valor debe ser entero")
        if clave == "dias_vigencia_publicacion" and not 1 <= iv <= 365:
            raise HTTPException(status_code=422, detail="vigencia 1..365 días")
        if clave == "max_reportes_para_pausa_automatica" and not 1 <= iv <= 20:
            raise HTTPException(status_code=422, detail="umbral 1..20")
    if tipo == "bool" and payload.valor.lower() not in ("true", "false"):
        raise HTTPException(status_code=422, detail="valor debe ser true|false")
    try:
        from datetime import datetime, timezone

        from app.models import SystemSetting

        row = (await db.execute(select(SystemSetting).where(SystemSetting.clave == clave))).scalars().first()
        if row:
            row.valor = payload.valor
            row.actualizado_en = datetime.now(timezone.utc)
        else:
            # Upsert: si la fila no existe (migración sin defaults), créala.
            db.add(SystemSetting(clave=clave, valor=payload.valor, tipo=tipo, descripcion=desc))
        await db.commit()
        clear_settings_cache()
        return SettingOut(clave=clave, valor=payload.valor, tipo=tipo, descripcion=desc)
    except HTTPException:
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        clear_settings_cache()
        return SettingOut(clave=clave, valor=payload.valor, tipo=tipo, descripcion=desc)


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
