"""M2 tipos de vivienda dinámicos: catálogo en BD + caché TTL 5min.

Uso: schemas (Pydantic), routers (Query), trust/search (allowlist/sinónimos).
- `get_activos(db)`: lista de dicts {slug, nombre_visible, descripcion_tooltip, icono}
  solo esta_activo=true, ordenados por slug. 1 query, caché 5min.
- `slugs_activos(db)`: set de slugs para validación rápida.
- `clear_cache()`: invalida tras CRUD admin (y en tests).
- Sin PG o tabla vacía: catálogo estático con los 6 slugs del seed (nunca rompe).
"""
import logging
import time

from sqlalchemy import select
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.housing_types")

# Fallback estático (seed canónico). Nunca se elimina ni renombra un slug.
FALLBACK_TIPOS = [
    {"slug": "HABITACION_FAMILIAR", "nombre_visible": "Habitación familiar",
     "descripcion_tooltip": "Habitación en casa de familia, ambiente compartido",
     "icono": "house", "esta_activo": True},
    {"slug": "HABITACION_INDEPENDIENTE", "nombre_visible": "Habitación independiente",
     "descripcion_tooltip": "Habitación privada con acceso independiente",
     "icono": "door-open", "esta_activo": True},
    {"slug": "APARTAESTUDIO", "nombre_visible": "Apartaestudio",
     "descripcion_tooltip": "Ambiente integrado con cocina y baño privados",
     "icono": "building", "esta_activo": True},
    {"slug": "COMPARTIDO", "nombre_visible": "Compartido",
     "descripcion_tooltip": "Cupo en vivienda compartida con otros estudiantes",
     "icono": "handshake", "esta_activo": True},
    {"slug": "APARTAMENTO_COMPLETO", "nombre_visible": "Apartamento completo",
     "descripcion_tooltip": "Apartamento entero para ti o tu grupo",
     "icono": "building-2", "esta_activo": True},
    {"slug": "HABITACION_PISO_COMPARTIDO", "nombre_visible": "Habitación en piso compartido",
     "descripcion_tooltip": "Habitación privada en piso con zonas comunes",
     "icono": "home", "esta_activo": True},
]

_TTL_S = 300.0
_cache: dict = {"ts": 0.0, "payload": None}


def clear_cache() -> None:
    _cache["ts"] = 0.0
    _cache["payload"] = None


def _cache_get():
    if _cache["payload"] is not None and (time.monotonic() - _cache["ts"]) < _TTL_S:
        return _cache["payload"]
    return None


def _cache_set(payload) -> None:
    _cache["payload"] = payload
    _cache["ts"] = time.monotonic()


async def get_activos(db) -> list[dict]:
    """Catálogo activo (caché 5min). Sin PG o tabla vacía -> catálogo estático."""
    hit = _cache_get()
    if hit is not None:
        return hit
    try:
        from app.models import HousingType
        rows = (await db.execute(
            select(HousingType).where(HousingType.esta_activo.is_(True)).order_by(HousingType.slug.asc())
        )).scalars().all()
        payload = [{
            "slug": r.slug, "nombre_visible": r.nombre_visible,
            "descripcion_tooltip": r.descripcion_tooltip, "icono": r.icono,
            "esta_activo": bool(r.esta_activo),
        } for r in rows]
        if payload:
            _cache_set(payload)
            return payload
    except Exception as e:
        await rollback_seguro(db, "get_activos")
        logger.warning("[tipos] catálogo desde BD falló, se usa el estático: %s", exc_resumen(e))
    payload = [dict(t) for t in FALLBACK_TIPOS if t.get("esta_activo")]
    _cache_set(payload)
    return payload


async def slugs_activos(db) -> set[str]:
    return {t["slug"] for t in await get_activos(db)}


async def validar_tipo(db, slug: str | None) -> str:
    """Valida un slug contra el catálogo activo. Retorna el slug o lanza ValueError."""
    if not slug:
        raise ValueError("tipo_inmueble requerido")
    activos = await slugs_activos(db)
    if slug not in activos:
        raise ValueError(f"tipo_inmueble '{slug}' no válido o inactivo")
    return slug
