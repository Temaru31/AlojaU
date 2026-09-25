"""M2 tipos de vivienda dinámicos: catálogo en BD + caché TTL 5min.

Uso: schemas (Pydantic), routers (Query), trust/search (allowlist/sinónimos).
- `get_activos(db)`: lista de dicts {slug, nombre_visible, descripcion_tooltip, icono}
  solo esta_activo=true, ordenados por slug. 1 query, caché 5min.
- `slugs_activos(db)`: set de slugs para validación rápida.
- `clear_cache()`: invalida tras CRUD admin (y en tests).
- Sin PG (mock/dev): fallback estático con los 6 slugs del seed (nunca rompe).
"""
import time

from sqlalchemy import select

# Fallback estático (seed canónico). Nunca se elimina ni renombra un slug.
FALLBACK_TIPOS = [
    {"slug": "HABITACION_FAMILIAR", "nombre_visible": "Habitación familiar",
     "descripcion_tooltip": "Habitación en casa de familia, ambiente compartido",
     "icono": "🏠", "esta_activo": True},
    {"slug": "HABITACION_INDEPENDIENTE", "nombre_visible": "Habitación independiente",
     "descripcion_tooltip": "Habitación privada con acceso independiente",
     "icono": "🚪", "esta_activo": True},
    {"slug": "APARTAESTUDIO", "nombre_visible": "Apartaestudio",
     "descripcion_tooltip": "Ambiente integrado con cocina y baño privados",
     "icono": "🏢", "esta_activo": True},
    {"slug": "COMPARTIDO", "nombre_visible": "Compartido",
     "descripcion_tooltip": "Cupo en vivienda compartida con otros estudiantes",
     "icono": "🤝", "esta_activo": True},
    {"slug": "APARTAMENTO_COMPLETO", "nombre_visible": "Apartamento completo",
     "descripcion_tooltip": "Apartamento entero para ti o tu grupo",
     "icono": "🏘️", "esta_activo": True},
    {"slug": "HABITACION_PISO_COMPARTIDO", "nombre_visible": "Habitación en piso compartido",
     "descripcion_tooltip": "Habitación privada en piso con zonas comunes",
     "icono": "🏡", "esta_activo": True},
]

_TTL_S = 300.0
_cache: dict = {"ts": 0.0, "payload": None}

# Mock dev: permite a tests/mocks añadir tipos sin PG (misma forma que FALLBACK).
MOCK_TIPOS: list[dict] = [dict(t) for t in FALLBACK_TIPOS]


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
    """Catálogo activo (caché 5min). Sin PG -> MOCK_TIPOS activos."""
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
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
    # Fallback mock/dev (o tabla vacía): MOCK_TIPOS activos.
    payload = [dict(t) for t in MOCK_TIPOS if t.get("esta_activo")]
    _cache_set(payload)
    return payload


async def slugs_activos(db) -> set[str]:
    return {t["slug"] for t in await get_activos(db)}


def slugs_fallback() -> set[str]:
    return {t["slug"] for t in FALLBACK_TIPOS if t.get("esta_activo")}


async def validar_tipo(db, slug: str | None) -> str:
    """Valida un slug contra el catálogo activo. Retorna el slug o lanza ValueError."""
    if not slug:
        raise ValueError("tipo_inmueble requerido")
    activos = await slugs_activos(db)
    if slug not in activos:
        raise ValueError(f"tipo_inmueble '{slug}' no válido o inactivo")
    return slug
