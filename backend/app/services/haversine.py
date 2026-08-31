"""
services/haversine.py - Cálculo geodésico aproximado (Sección 5.5 p21)
No promete ruteo a pie, solo distancia en línea recta. P95 <500ms => cálculo en backend (no en DB PostGIS para Sprint1).

Fórmula:
  d = 2·R·asin( sqrt( sin²(Δφ/2) + cos φ1·cos φ2·sin²(Δλ/2) ) )
  R = 6 371 000 m, ángulos en radianes.
"""
import math

R_METROS = 6_371_000  # radio terrestre WGS84

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """
    Retorna distancia geodésica en metros (int) entre dos puntos.
    Validación: lat ∈ [-90,90], lon ∈ [-180,180] debe hacerse en schema/caller.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    # clamp por errores de punto flotante
    a = min(1.0, max(0.0, a))
    return int(round(2 * R_METROS * math.asin(math.sqrt(a))))

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_m(lat1, lon1, lat2, lon2) / 1000.0

# Dónde se llama (Sprint1):
# - routers/publicaciones.py::list_publicaciones() si campus_id presente: para cada pub calcular dist_m a campus
# - services/trust no lo usa
# - Al crear publicación (POST): se precalcula y persiste en publicacion_campus.distancia_geodesica_m
#   para no recalcular en cada búsqueda (índice en (campus_id, distancia))
