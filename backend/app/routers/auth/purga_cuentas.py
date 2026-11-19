"""Soft-delete de cuentas: días de gracia restantes y purga física al vencer."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db_utils import rollback_seguro
from app.core.dominio import DIAS_GRACIA_CUENTA
from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.auth")


def gracia_restante(u) -> int | None:
    """Días restantes de gracia, None si la cuenta está activa."""
    elim = getattr(u, "eliminado_en", None)
    if elim is None:
        return None
    if getattr(elim, "tzinfo", None) is None:
        elim = elim.replace(tzinfo=timezone.utc)
    fin = elim + timedelta(days=DIAS_GRACIA_CUENTA)
    restan = (fin - datetime.now(timezone.utc)).days
    return restan


async def intentar_purgar_usuario(db: AsyncSession, u) -> None:
    """Borrado físico: cascadas (publicaciones, sesiones) + SET NULL (reportes).

    Best-effort: si falla se registra y la transacción queda limpia; la cuenta
    vencida se volverá a purgar en el próximo intento de login/registro.
    """
    try:
        await db.delete(u)
        await db.commit()
    except Exception as e:
        logger.warning("[cuentas] purga de usuario %s falló: %s",
                       getattr(u, "id", "?"), exc_resumen(e))
        await rollback_seguro(db, "intentar_purgar_usuario")
