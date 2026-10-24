"""services/publicidad.py - Job vencimiento de destacados (Task 4).

`vencer_destacados(db) -> int`: marca VENCIDO todo destacado con
vence <= now() y estado en (PENDIENTE, ACTIVO). Es un UPDATE masivo:
el historial nunca se borra (VENCIDO no bloquea un nuevo intento).
Retorna cuántos marcó. Idempotente: una segunda corrida marca 0.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.publicidad")


async def vencer_destacados(db: AsyncSession) -> int:
    """Marca VENCIDO los destacados caducados. Retorna el conteo.

    Lanza la excepción original si la BD falla (el router decide el
    fallback mock); siempre hace rollback antes de propagar.
    """
    from app.models import PublicacionDestacado

    ahora = datetime.now(timezone.utc)
    try:
        res = await db.execute(
            update(PublicacionDestacado)
            .where(
                PublicacionDestacado.estado.in_(["PENDIENTE", "ACTIVO"]),
                PublicacionDestacado.vence <= ahora,
            )
            .values(estado="VENCIDO")
        )
        await db.commit()
        n = int(res.rowcount or 0)
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[publicidad] vencer_destacados falló: {exc_resumen(e)}")
        raise
    if n:
        logger.info(f"[publicidad] vencer_destacados marcó {n} VENCIDO(s)")
    return n
