"""Publicación de avisos: gate de escritura (rol real, email, teléfono) y creación idempotente."""
import logging
from fastapi import APIRouter
from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.security import get_current_user, ClaimsUsuario, id_propietario
from app.core.logseguro import exc_resumen
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import PublicacionCreate, PublicacionCreatedOut
from app.core.db_utils import rollback_seguro
from app.core.dominio import EstadoPublicacion, Rol
from app.core.permissions import has_scope
from app.routers.publicaciones.comun import IDEM_RUTA_CREAR, _check_pub_rate_limit, _exigir_tipo_activo
from app.services import idempotencia

logger = logging.getLogger("alojau.publicaciones")
router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])

@dataclass(frozen=True)
class _Escritor:
    """Datos reales de quien publica, leídos de la BD."""
    rol: str | None
    email_verificado: bool | None = None
    telefono: str | None = None
    eliminado: bool = False
    de_fuente_real: bool = False  # False: solo se conocen los claims del JWT


async def _gate_escritura(db: AsyncSession, user: ClaimsUsuario) -> tuple[dict, bool]:
    """Guard de escritura con el rol REAL (el claim del JWT puede estar rancio).

    Orden: cuenta no eliminada -> email confirmado -> teléfono vinculado ->
    scope `publications:write` (auto-promueve ESTUDIANTE a ARRENDADOR).
    Retorna (user con el rol real y sin `scopes` rancios, hubo_promocion).
    403 por cuenta en borrado, email o scope; 400 sin teléfono.
    """
    escritor = await _escritor_real(db, user)
    user = {**user, "rol": escritor.rol or user.get("rol")}
    if escritor.eliminado:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta está en proceso de eliminación. Restáurala antes de publicar.",
        )
    if escritor.de_fuente_real:
        user.pop("scopes", None)  # sin claim, los scopes derivan del rol real
    if not user.get("email_verificado") and escritor.email_verificado is False:
        raise HTTPException(
            status_code=403,
            detail="Confirma tu correo antes de publicar (revisa tu email o solicita un código en /api/auth/otp/solicitar)",
        )
    if not (escritor.telefono or user.get("telefono_whatsapp")):
        raise HTTPException(
            status_code=400,
            detail="Vincula un número de contacto antes de publicar (Mi Perfil → Datos y contacto)",
        )
    if has_scope(user, "publications:write"):
        return user, False
    user, promovido = await _autopromover_estudiante(db, user)
    if not has_scope(user, "publications:write"):
        raise HTTPException(status_code=403, detail="Solo ARRENDADOR puede publicar (se requiere 'publications:write')")
    return user, promovido


async def _escritor_real(db: AsyncSession, user: ClaimsUsuario) -> _Escritor:
    from app.models import Usuario
    try:
        res = await db.execute(select(Usuario).where(Usuario.id == user["id"]))
        usuario = res.scalars().first()
    except Exception as e:
        logger.warning("[publicar] lectura del usuario falló: %s", exc_resumen(e))
        await rollback_seguro(db, "_escritor_real")
        usuario = None
    if usuario is not None:
        return _Escritor(
            rol=usuario.rol,
            email_verificado=bool(getattr(usuario, "email_verificado", True)),
            telefono=getattr(usuario, "telefono_whatsapp", None),
            eliminado=getattr(usuario, "eliminado_en", None) is not None,
            de_fuente_real=True,
        )
    return _Escritor(rol=user.get("rol"))


async def _autopromover_estudiante(db: AsyncSession, user: ClaimsUsuario) -> tuple[dict, bool]:
    """ESTUDIANTE -> ARRENDADOR al publicar por primera vez."""
    if user.get("rol") != Rol.ESTUDIANTE:
        return user, False
    from app.services import role_lifecycle
    try:
        promovido = await role_lifecycle.promover_si_estudiante(db, user["id"]) == Rol.ARRENDADOR
    except Exception as e:
        logger.warning("[publicar] auto-promoción a ARRENDADOR falló: %s", exc_resumen(e))
        promovido = False
    if not promovido:
        return user, False
    promovido_user = {**user, "rol": Rol.ARRENDADOR}
    promovido_user.pop("scopes", None)
    return promovido_user, True


async def _auto_moderar(db: AsyncSession, nueva) -> dict | None:
    """Aplica la moderación automática (apagada por defecto: queda PENDIENTE).

    Retorna el resultado solo si auto-aprobó; un fallo deja el flujo manual.
    """
    from app.services import auto_moderation
    try:
        resultado = await auto_moderation.evaluar_y_aplicar(db, nueva)
        await db.commit()
        await db.refresh(nueva)
    except Exception as e:
        logger.warning(f"[automod] no aplicada, sigue flujo manual: {exc_resumen(e)}")
        return None
    aprobada = resultado.labels.get("auto", True) is not False and resultado.decision == auto_moderation.APPROVE
    return resultado.to_dict() if aprobada else None


async def _alertar_auto_aprobacion(db: AsyncSession, nueva, payload: PublicacionCreate, dueno_id: int,
                                   campus_ids, servicios_ids) -> None:
    """Alertas "nuevo arriendo" y aviso in-app al dueño. Best-effort, tras el commit."""
    from app.services import notifications_matcher
    try:
        await notifications_matcher.evaluar_y_crear_notificaciones(
            db, publicacion_id=nueva.id, dueno_id=dueno_id,
            titulo=nueva.titulo, canon=payload.canon_mensual,
            campus_ids=list(campus_ids), zona_id=payload.zona_barrio_id,
            tipo=payload.tipo_inmueble, servicios_ids=list(servicios_ids),
        )
        await notifications_matcher.notificar_moderacion(
            db, usuario_id=dueno_id, publicacion_id=nueva.id,
            titulo_pub=nueva.titulo, estado=EstadoPublicacion.ACTIVO,
        )
    except Exception as e:
        logger.warning("[publicar] notificaciones de auto-aprobación fallaron: %s", exc_resumen(e))


def _respuesta_creacion(nueva, trust: dict, rol: str | None, rol_actualizado: bool,
                        moderacion: dict | None) -> dict:
    pendiente = nueva.estado == EstadoPublicacion.PENDIENTE
    return {
        "id": nueva.id, "estado": nueva.estado,
        "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"],
        "mensaje": ("Publicación en PENDIENTE, pendiente de moderación" if pendiente
                    else "Publicación aprobada automáticamente"),
        "rol": rol, "rol_actualizado": rol_actualizado, "moderacion": moderacion,
    }


@router.post("", response_model=PublicacionCreatedOut, status_code=status.HTTP_201_CREATED, summary="HU-005 Publicar oferta estructurada -> PENDIENTE (auto-promueve ESTUDIANTE)")
async def crear_publicacion(
    payload: PublicacionCreate,
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    # Reintento seguro. Sin header no hay replay (el cliente ya
    # no reintenta escrituras salvo con clave).
    idempotency_key: Optional[str] = Header(None),
):
    """HU-005: publica una oferta que nace PENDIENTE de moderación.

    El rol se verifica contra la BD y un ESTUDIANTE se promueve a
    ARRENDADOR al publicar (ver `_gate_escritura`). La respuesta incluye
    `rol` y `rol_actualizado` para que el frontend refresque el perfil.
    401 sin propietario válido, 403 sin email/scope o cuenta en borrado,
    400 sin teléfono, 422 tipo inválido, 404 FK inexistente, 503 sin BD.
    """
    id_propietario(user)
    user, rol_actualizado = await _gate_escritura(db, user)
    clave_idem = idempotencia.validar_clave(idempotency_key)
    if clave_idem:
        previo = await idempotencia.respuesta_previa(db, clave_idem, user["id"], IDEM_RUTA_CREAR)
        if previo is not None:
            return previo["cuerpo"]
    # Anti-flood tras el replay: los reintentos del cliente no queman cuota.
    _check_pub_rate_limit(user["id"])
    await _exigir_tipo_activo(db, payload.tipo_inmueble, "tipo_inmueble")
    trust = view.initial_trust(payload, bool(user.get("telefono_verificado", False)))
    try:
        campus_ids, servicios_ids = await repo.validate_fks(
            db, payload.zona_barrio_id, payload.campus_ids, payload.servicios_ids
        )
        nueva = await repo.create_persisted(db, payload, user["id"], trust, campus_ids, servicios_ids)
        moderacion = await _auto_moderar(db, nueva)
        if nueva.estado == EstadoPublicacion.ACTIVO:
            await _alertar_auto_aprobacion(db, nueva, payload, user["id"], campus_ids, servicios_ids)
        resp = _respuesta_creacion(nueva, trust, user.get("rol"), rol_actualizado, moderacion)
        if clave_idem:
            ganador = await idempotencia.guardar_respuesta(db, clave_idem, user["id"], IDEM_RUTA_CREAR, resp)
            if ganador is not None:  # carrera: gana la respuesta ya guardada
                return ganador["cuerpo"]
        return resp
    except HTTPException:
        await rollback_seguro(db, "crear_publicacion")
        raise
    except Exception as e:
        await rollback_seguro(db, "crear_publicacion")
        logger.error(f"[DB crear] falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
