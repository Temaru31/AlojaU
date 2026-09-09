from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db.session import get_session
from ..core.config import settings
import logging
logger = logging.getLogger("alojau.campus")

router = APIRouter(prefix="/api/campus", tags=["campus"])

MOCK_CAMPUS = [
    {"id": 1, "ciudad_id": 1, "institucion": "Universidad del Cauca", "nombre_sede": "Campus Tulcán", "direccion": "Calle 5 # 4-70", "latitud": 2.4430000, "longitud": -76.6060000, "activo": True},
    {"id": 2, "ciudad_id": 1, "institucion": "Unicomfacauca", "nombre_sede": "Claustro Centro", "direccion": "Calle 4 # 8-30", "latitud": 2.4410000, "longitud": -76.6060000, "activo": True},
]

@router.get("", summary="HU-001 - Listar campus activos")
async def list_campus(db: AsyncSession = Depends(get_session)):
    """Lista campus activos. En prod sin DB -> 503, en dev -> mock."""
    try:
        # Intenta DB real
        from ..models.publicacion import CampusUniversitario
        res = await db.execute(select(CampusUniversitario).where(CampusUniversitario.activo==True))
        rows = res.scalars().all()
        if rows:
            return [{"id": r.id, "institucion": r.institucion, "nombre_sede": r.nombre_sede, "latitud": float(r.latitud), "longitud": float(r.longitud)} for r in rows]
    except Exception as e:
        logger.error(f"[campus] DB falló: {e!r}", exc_info=True)
        mock_ok = bool(getattr(settings, "mock_enabled", False))
        if not mock_ok:
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return MOCK_CAMPUS
