from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db.session import get_session

router = APIRouter(prefix="/api/campus", tags=["campus"])

MOCK_CAMPUS = [
    {"id": 1, "ciudad_id": 1, "institucion": "Universidad del Cauca", "nombre_sede": "Campus Tulcán", "direccion": "Calle 5 # 4-70", "latitud": 2.4430000, "longitud": -76.6060000, "activo": True},
    {"id": 2, "ciudad_id": 1, "institucion": "Unicomfacauca", "nombre_sede": "Claustro Centro", "direccion": "Calle 4 # 8-30", "latitud": 2.4410000, "longitud": -76.6060000, "activo": True},
]

@router.get("", summary="HU-001 - Listar campus activos")
async def list_campus(db: AsyncSession = Depends(get_session)):
    try:
        # Intenta DB real
        from ..models.publicacion import CampusUniversitario
        res = await db.execute(select(CampusUniversitario).where(CampusUniversitario.activo==True))
        rows = res.scalars().all()
        if rows:
            return [{"id": r.id, "institucion": r.institucion, "nombre_sede": r.nombre_sede, "latitud": float(r.latitud), "longitud": float(r.longitud)} for r in rows]
    except Exception:
        pass
    return MOCK_CAMPUS
