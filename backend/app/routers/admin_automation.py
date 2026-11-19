"""routers/admin_automation.py — Ajustes del Sistema + evaluación de pausa automática.

  GET    /api/admin/automation/settings         (ADMIN: lista los ajustes)
  PATCH  /api/admin/automation/settings/{clave} (ADMIN: edita un valor tipado)
  POST   /api/admin/automation/evaluar/{pub_id} (ADMIN: pausa automática por reportes)

La lectura y la caché viven en `repositories/ajustes_repo.py`; la regla de
pausa, en `services/moderacion.py`. Este módulo solo valida y traduce a HTTP.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db_utils import rollback_seguro
from app.core.errores import NoEncontrado
from app.core.logseguro import exc_resumen
from app.core.security import ClaimsUsuario, id_o_none, require_admin
from app.db.session import get_session
from app.models import PublicacionesAudit
from app.repositories import ajustes_repo
from app.services import moderacion
from app.services.config_sistema import DEFAULTS

logger = logging.getLogger("alojau.admin")

router = APIRouter(prefix="/api/admin/automation", tags=["admin-automation"])


class SettingOut(BaseModel):
    clave: str
    valor: str
    tipo: str = "int"
    descripcion: str | None = None
    seccion: str = "general"


class SettingPatch(BaseModel):
    valor: str


def _setting_out(clave: str, valor: str) -> SettingOut:
    _default, tipo, descripcion, seccion = DEFAULTS[clave]
    return SettingOut(clave=clave, valor=valor, tipo=tipo, descripcion=descripcion, seccion=seccion)


@router.get("/settings", response_model=list[SettingOut], summary="Admin: listar ajustes del sistema")
async def listar_settings(
    db: AsyncSession = Depends(get_session), admin: ClaimsUsuario = Depends(require_admin)
):
    """Todas las claves conocidas; la BD solo sobrescribe valores (sin tabla -> defaults)."""
    valores = await ajustes_repo.leer_todos(db)
    return [_setting_out(clave, valores[clave]) for clave in DEFAULTS]


# Rango permitido por ajuste numérico: clave -> (mínimo, máximo, mensaje del 422).
_RANGOS_SETTINGS = {
    "dias_vigencia_publicacion": (1, 365, "vigencia 1..365 días"),
    "max_reportes_para_pausa_automatica": (1, 20, "umbral 1..20"),
    "dias_desactualizada": (1, 365, "rango 1..365 días"),
    "titulo_min": (1, 100, "rango 1..100"),
    "descripcion_min": (1, 100, "rango 1..100"),
    "titulo_max": (10, 150, "rango 10..150"),
    "descripcion_max": (100, 5000, "rango 100..5000"),
    "fotos_min_publicar": (1, 10, "rango 1..10"),
    "umbral_aprobacion_ia": (0.0, 1.0, "rango 0..1"),
}
_CONVERSORES = {"int": (int, "valor debe ser entero"), "float": (float, "valor debe ser decimal")}
_MAX_LARGO_TEXTO = 2000


def _validar_valor_setting(clave: str, tipo: str, valor: str) -> None:
    """422 si el valor no corresponde al tipo del ajuste o sale de su rango."""
    if tipo in _CONVERSORES:
        convertir, error_tipo = _CONVERSORES[tipo]
        try:
            numero = convertir(valor)
        except ValueError:
            raise HTTPException(status_code=422, detail=error_tipo)
        rango = _RANGOS_SETTINGS.get(clave)
        if rango and not rango[0] <= numero <= rango[1]:
            raise HTTPException(status_code=422, detail=rango[2])
    if tipo == "bool" and valor.lower() not in ("true", "false"):
        raise HTTPException(status_code=422, detail="valor debe ser true|false")
    if tipo == "str" and len(valor) > _MAX_LARGO_TEXTO:
        raise HTTPException(status_code=422, detail=f"máximo {_MAX_LARGO_TEXTO} caracteres")


@router.patch("/settings/{clave}", response_model=SettingOut, summary="Admin: editar ajuste del sistema")
async def editar_setting(
    clave: str, payload: SettingPatch,
    db: AsyncSession = Depends(get_session), admin: ClaimsUsuario = Depends(require_admin)
):
    """Edita un ajuste validando tipo y rango; el cambio queda auditado."""
    if clave not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"setting '{clave}' desconocido")
    _validar_valor_setting(clave, DEFAULTS[clave][1], payload.valor)
    try:
        anterior = await ajustes_repo.guardar(db, clave, payload.valor)
        db.add(PublicacionesAudit(
            publicacion_id=None,
            usuario_id=id_o_none(admin),
            evento="SETTINGS",
            detalle=f"{clave}: {anterior} -> {payload.valor}",
        ))
        await db.commit()
    except Exception as e:
        # Un fallo de persistencia nunca se reporta como éxito.
        logger.error("[settings] persistencia falló: %s", exc_resumen(e))
        await rollback_seguro(db, "editar_setting")
        raise HTTPException(status_code=503, detail="No se pudo guardar el ajuste")
    ajustes_repo.limpiar_cache()
    return _setting_out(clave, payload.valor)


@router.post("/evaluar/{pub_id}", summary="Admin: evaluar pausa automática por reportes")
async def evaluar_pub(
    pub_id: int, db: AsyncSession = Depends(get_session), admin: ClaimsUsuario = Depends(require_admin)
):
    """Pausa el aviso (PAUSADO_POR_REPORTE) si sus reportes abiertos alcanzan el umbral."""
    try:
        evaluacion = await moderacion.evaluar_pausa_por_reportes(db, pub_id, id_o_none(admin))
        if evaluacion.pausado:
            await db.commit()
    except NoEncontrado:
        raise
    except Exception as e:
        logger.error("[evaluar_pub] %s falló: %s", pub_id, exc_resumen(e))
        await rollback_seguro(db, "evaluar_pub")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return evaluacion.como_dict()
