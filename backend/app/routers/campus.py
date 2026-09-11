import time
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db.session import get_session
from ..core.config import settings
from app.schemas.publicacion import CampusOut
from app.fixtures.demo import MOCK_CAMPUS_LIST as MOCK_CAMPUS
from typing import List
import logging
logger = logging.getLogger("alojau.campus")

router = APIRouter(prefix="/api/campus", tags=["campus"])

# 004 POIs: caché en proceso del catálogo (lugares casi estáticos).
# TTL 1h como pide el diseño. Nota escala: con 1 worker (Render free) basta;
# con múltiples workers cada uno cachea igual (eventual-consistency 1h, OK
# para un catálogo que solo cambia por migración/ingesta). Redis quedaría
# para cuando haya escrituras frecuentes de lugares (hoy no hay endpoint).
_CACHE_TTL_S = 3600
_cache: dict = {"ts": 0.0, "payload": None}


def _row_to_out(r) -> dict:
    return {
        "id": r.id,
        "institucion": r.institucion,
        "nombre_sede": r.nombre_sede,
        "latitud": float(r.latitud),
        "longitud": float(r.longitud),
        "categoria": getattr(r, "categoria", None) or "UNIVERSIDAD",
        "direccion": getattr(r, "direccion", None),
        "ciudad_id": getattr(r, "ciudad_id", None),
    }


@router.get("", response_model=List[CampusOut], summary="HU-001 - Listar lugares activos (+004 POIs por categoría)")
async def list_campus(response: Response, db: AsyncSession = Depends(get_session)):
    """Lista lugares activos ordenados por categoría. En prod sin DB -> 503, en dev -> mock. DB vacía -> [].

    004: incluye `categoria` para el filtro "Cercano a..." agrupado. Cache-Control
    público 1h para que Vercel/CDN no repitan el fetch por cada visita.
    """
    ahora = time.monotonic()
    if _cache["payload"] is not None and (ahora - _cache["ts"]) < _CACHE_TTL_S:
        response.headers["Cache-Control"] = "public, max-age=3600"
        response.headers["X-Cache"] = "HIT"
        return _cache["payload"]
    try:
        # Intenta DB real
        from ..models.publicacion import CampusUniversitario
        res = await db.execute(
            select(CampusUniversitario)
            .where(CampusUniversitario.activo == True)  # noqa: E712
            .order_by(CampusUniversitario.categoria, CampusUniversitario.institucion)
        )
        rows = res.scalars().all()
        payload = [_row_to_out(r) for r in rows]
    except Exception as e:
        logger.error(f"[campus] DB falló: {e!r}", exc_info=True)
        mock_ok = bool(getattr(settings, "mock_enabled", False))
        if not mock_ok:
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        payload = [
            {
                "id": c["id"], "institucion": c["institucion"], "nombre_sede": c["nombre_sede"],
                "latitud": float(c["latitud"]), "longitud": float(c["longitud"]),
                "categoria": c.get("categoria", "UNIVERSIDAD"),
                "direccion": c.get("direccion"), "ciudad_id": c.get("ciudad_id"),
            }
            for c in MOCK_CAMPUS
        ]
    _cache["ts"] = ahora
    _cache["payload"] = payload
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Cache"] = "MISS"
    return payload
