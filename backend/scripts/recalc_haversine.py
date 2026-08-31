"""Recalcula publicacion_campus.distancia_geodesica_m con Haversine"""
import math, asyncio, os
R=6371000
def haversine_m(lat1,lon1,lat2,lon2):
    phi1,phi2=math.radians(lat1),math.radians(lat2)
    dphi, dlam=math.radians(lat2-lat1), math.radians(lon2-lon1)
    a=math.sin(dphi/2)**2+math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return int(round(2*R*math.asin(math.sqrt(min(1,max(0,a))))))
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
