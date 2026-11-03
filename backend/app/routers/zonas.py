"""GET /api/zonas — catálogo de zonas/barrios (v10, flexi-barrios).

Lista zonas con su ciudad para el combobox de Publicar. Sin auth.
Cache-Control 1h (mismo patrón que /api/campus y /api/ciudades).
Sin DB -> 503.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.db.session import get_session

import logging
from app.core.db_utils import rollback_seguro

logger = logging.getLogger("alojau.zonas")

router = APIRouter(prefix="/api/zonas", tags=["zonas"])

_CACHE_TTL_S = 3600
_cache: dict = {"ts": 0.0, "payload": None}


def clear_zonas_cache() -> None:
    """Invalida el caché (tests + ingesta manual)."""
    _cache["ts"] = 0.0
    _cache["payload"] = None


@router.get("", summary="Listar zonas/barrios del catálogo")
async def list_zonas(response: Response, db: AsyncSession = Depends(get_session)):
    """[{id, ciudad_id, nombre, estrato}] ordenadas por nombre."""
    ahora = time.monotonic()
    if _cache["payload"] is not None and (ahora - _cache["ts"]) < _CACHE_TTL_S:
        response.headers["Cache-Control"] = "public, max-age=3600"
        response.headers["X-Cache"] = "HIT"
        return _cache["payload"]
    try:
        from app.models import ZonaBarrio

        rows = (
            await db.execute(select(ZonaBarrio).order_by(ZonaBarrio.nombre.asc()))
        ).scalars().all()
        payload = [
            {"id": r.id, "ciudad_id": r.ciudad_id, "nombre": r.nombre, "estrato": r.estrato}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"[zonas] DB falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "list_zonas")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    _cache["ts"] = ahora
    _cache["payload"] = payload
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Cache"] = "MISS"
    return payload
