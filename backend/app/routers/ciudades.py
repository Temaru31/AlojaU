"""GET /api/ciudades — catálogo multiciudad (Fase 4).

Lista ciudades activas con slug URL-safe. Sin auth. Cache-Control 1h
(mismo patrón que /api/campus). En prod sin DB -> 503, en dev -> mock Popayán.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.services.ciudades import ciudad_to_out

import logging

logger = logging.getLogger("alojau.ciudades")

router = APIRouter(prefix="/api/ciudades", tags=["ciudades"])

_CACHE_TTL_S = 3600
_cache: dict = {"ts": 0.0, "payload": None}


def clear_ciudades_cache() -> None:
    """Invalida el caché (tests + ingesta manual)."""
    _cache["ts"] = 0.0
    _cache["payload"] = None


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


@router.get("", summary="Listar ciudades activas (multiciudad)")
async def list_ciudades(response: Response, db: AsyncSession = Depends(get_session)):
    """[{id, nombre, departamento, slug, activo}] ordenadas por nombre."""
    ahora = time.monotonic()
    if _cache["payload"] is not None and (ahora - _cache["ts"]) < _CACHE_TTL_S:
        response.headers["Cache-Control"] = "public, max-age=3600"
        response.headers["X-Cache"] = "HIT"
        return _cache["payload"]
    try:
        from app.models import Ciudad

        rows = (
            await db.execute(
                select(Ciudad).where(Ciudad.activo.is_(True)).order_by(Ciudad.nombre.asc())
            )
        ).scalars().all()
        payload = [ciudad_to_out(r) for r in rows]
    except Exception as e:
        logger.error(f"[ciudades] DB falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        payload = [
            {"id": 1, "nombre": "Popayán", "departamento": "Cauca", "slug": "popayan", "activo": True}
        ]
    _cache["ts"] = ahora
    _cache["payload"] = payload
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Cache"] = "MISS"
    return payload
