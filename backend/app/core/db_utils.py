"""Utilidades transaccionales compartidas por routers y servicios."""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.db")


async def rollback_seguro(db: AsyncSession, contexto: str) -> None:
    """Revierte la transacción tras un fallo sin ocultar el error original.

    Si el propio rollback falla (conexión caída), se registra y no se propaga:
    quien llama ya está manejando la excepción que motivó el rollback.
    """
    try:
        await db.rollback()
    except Exception as e:
        logger.warning("[%s] rollback falló: %s", contexto, exc_resumen(e))
