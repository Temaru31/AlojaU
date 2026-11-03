"""Efectos de la moderación sobre el dueño: democión de rol y avisos (in-app y Telegram)."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logseguro import exc_resumen
from app.core.dominio import EstadoPublicacion

logger = logging.getLogger("alojau.admin")

ESTADO_A_EVENTO = {EstadoPublicacion.ACTIVO: "APPROVED", EstadoPublicacion.RECHAZADO: "REJECTED", EstadoPublicacion.PAUSADO: "PAUSED"}


async def _evaluar_democion_dueno(db: AsyncSession, dueno_id: int | None) -> bool:
    """Demociona al dueño si quedó sin avisos vigentes (misma transacción).

    Best-effort: un fallo aquí nunca revierte el cambio de moderación.
    Retorna True si hubo democión.
    """
    from app.services import role_lifecycle
    try:
        await db.flush()
        _, democionado = await role_lifecycle.evaluar_democion(db, dueno_id)
        return bool(democionado)
    except Exception as e:
        logger.warning("[admin] democión del dueño %s falló: %s", dueno_id, exc_resumen(e))
        return False


async def _notificar_moderacion_in_app(db: AsyncSession, p, estado: str) -> None:
    """Alertas "nuevo arriendo" (solo al aprobar: un rechazo nunca anuncia un
    aviso invisible) y aviso in-app al dueño. Best-effort, antes del commit."""
    from app.services import notifications_matcher
    if estado == EstadoPublicacion.ACTIVO:
        try:
            await notifications_matcher.evaluar_y_crear_notificaciones(
                db, publicacion_id=p.id, dueno_id=int(p.usuario_id),
                titulo=p.titulo, canon=p.canon_mensual,
                campus_ids=[c.campus_id for c in (p.campus_links or [])],
                zona_id=p.zona_barrio_id, tipo=p.tipo_inmueble,
                servicios_ids=[s.id for s in (p.servicios or [])],
            )
        except Exception as e:
            logger.warning("[admin] alertas del aviso %s fallaron: %s", p.id, exc_resumen(e))
    try:
        await notifications_matcher.notificar_moderacion(
            db, usuario_id=int(p.usuario_id), publicacion_id=p.id,
            titulo_pub=p.titulo, estado=estado,
        )
    except Exception as e:
        logger.warning("[admin] aviso in-app del aviso %s falló: %s", p.id, exc_resumen(e))


async def _notificar_dueno_estado(db, usuario_id: int | None, titulo: str, estado: str) -> str:
    """Avisa al dueño del cambio de estado (best-effort, nunca rompe el 200).

    Delega en el centro de notificaciones (services/notifications):
    DM de Telegram si hay chat vinculado, si no queda el aviso dentro de
    la app (banner de Mis publicaciones). Retorna canal o "none".
    """
    try:
        from app.services import notifications as _nt
        return await _nt.notificar_cambio_estado(db, usuario_id, titulo, estado)
    except Exception as e:
        logger.warning(f"[admin notificar] fallo best-effort: {exc_resumen(e)}")
        return "none"
