"""GET /api/zonas — catálogo de zonas/barrios (v10, flexi-barrios).

Lista zonas con su ciudad para el combobox de Publicar. Sin auth.
Cache-Control 1h (mismo patrón que /api/campus y /api/ciudades).
En prod sin DB -> 503, en dev -> mock con las 6 zonas del seed.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session

import logging

logger = logging.getLogger("alojau.zonas")

router = APIRouter(prefix="/api/zonas", tags=["zonas"])

_CACHE_TTL_S = 3600
_cache: dict = {"ts": 0.0, "payload": None}


def clear_zonas_cache() -> None:
    """Invalida el caché (tests + ingesta manual)."""
    _cache["ts"] = 0.0
    _cache["payload"] = None


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


MOCK_ZONAS = [
    {"id": 1, "ciudad_id": 1, "nombre": "Centro", "estrato": 3},
    {"id": 2, "ciudad_id": 1, "nombre": "Pandiguando", "estrato": 2},
    {"id": 3, "ciudad_id": 1, "nombre": "Tulcán", "estrato": 3},
    {"id": 4, "ciudad_id": 1, "nombre": "Torobajo", "estrato": 4},
    {"id": 5, "ciudad_id": 1, "nombre": "Catay", "estrato": 2},
    {"id": 6, "ciudad_id": 1, "nombre": "Alfonso López", "estrato": 2},
]


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
        logger.error(f"[zonas] DB falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        payload = [dict(z) for z in MOCK_ZONAS]
    _cache["ts"] = ahora
    _cache["payload"] = payload
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Cache"] = "MISS"
    return payload
