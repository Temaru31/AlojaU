"""Distancia geodésica Haversine en metros (línea recta, no ruteo).
Uso: routers/publicaciones.py al listar/crear. Ej: haversine_m(2.444,-76.606,2.443,-76.606) -> 111."""
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


# 004 POIs: minutos a pie desde distancia geodésica.
# Factor 1.3 = la ruta real a pie es ~30% más larga que la línea recta
# (cuadras de Popayán); 80 m/min = paso estándar (igual que el frontend).
# Fuente única backend de "Y min a pie" (ver view.build_detail campus_ref).
def tiempo_pie_min(dist_m: int | None) -> int | None:
    """Minutos a pie (mínimo 1) o None si la distancia es desconocida."""
    if dist_m is None:
        return None
    try:
        return max(1, round(float(dist_m) * 1.3 / 80))
    except (TypeError, ValueError):
        return None

# Llamado en: list/crear publicaciones para distancia a campus.
