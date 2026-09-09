"""Recalcula publicacion_campus.distancia_geodesica_m con Haversine canónico."""
import asyncio, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.services.haversine import haversine_m  # canónico (no duplicar fórmula)
async def main():
    try:
        import asyncpg
        dsn=os.getenv("DATABASE_URL","postgresql://alojau:alojau123@localhost:5432/alojau")
        dsn=dsn.replace("postgresql+asyncpg://","postgresql://")
        conn=await asyncpg.connect(dsn)
        rows=await conn.fetch("SELECT p.id, p.latitud, p.longitud, c.id as cid, c.latitud as clat, c.longitud as clon FROM publicaciones p, campus_universitarios c")
        for r in rows:
            d=haversine_m(float(r['latitud']),float(r['longitud']),float(r['clat']),float(r['clon']))
            await conn.execute("UPDATE publicacion_campus SET distancia_geodesica_m=$1 WHERE publicacion_id=$2 AND campus_id=$3", d, r['id'], r['cid'])
        print("recalculado", len(rows))
        await conn.close()
    except Exception as e:
        print("dry-run sin BD:", e)
        print("demo:", haversine_m(2.443,-76.606,2.445,-76.61))
if __name__=="__main__":
    import sys
    if "--dry-run" in sys.argv:
        print("haversine demo Tulcán-Pandiguando:", haversine_m(2.443,-76.606,2.445,-76.61), "m")
    else:
        asyncio.run(main())
