"""Mantenimiento de cuentas: purga física de cuentas con gracia vencida."""
import logging
from fastapi import APIRouter
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import require_admin, ClaimsUsuario
from app.core.logseguro import exc_resumen
from app.db.session import get_session
from app.core.db_utils import rollback_seguro
from app.core.dominio import DIAS_GRACIA_CUENTA

logger = logging.getLogger("alojau.admin")
router = APIRouter()

@router.post("/cuentas/purgar", summary="Admin: purga física de cuentas con gracia vencida")
async def purgar_cuentas(
    db: AsyncSession = Depends(get_session),
    admin: ClaimsUsuario = Depends(require_admin),
):
    """v13.1: borra físicamente cuentas con eliminado_en > 30 días.

    Diseñado para cron (pg_cron o llamada diaria).
    """
    from datetime import datetime, timezone, timedelta
    corte = datetime.now(timezone.utc) - timedelta(days=DIAS_GRACIA_CUENTA)
    try:
        from app.models import Usuario

        res = await db.execute(
            select(Usuario).where(Usuario.eliminado_en.is_not(None),
                                  Usuario.eliminado_en < corte))
        n = 0
        for u in res.scalars().all():
            await db.delete(u)
            n += 1
        await db.commit()
        return {"purgadas": n, "gracia_dias": DIAS_GRACIA_CUENTA}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DB fallback] purgar_cuentas falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "purgar_cuentas")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
