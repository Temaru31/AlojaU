"""Utilidades multiciudad (Fase 4).

Uso: routers/ciudades.py, repositories/publicacion_repo.py.
Ej: slugify("Popayán") -> "popayan".
"""

import re
import unicodedata


def slugify(nombre: str) -> str:
    """Slug URL-safe: minúsculas, sin tildes, espacios -> '-'."""
    s = "".join(
        c for c in unicodedata.normalize("NFD", (nombre or "").lower())
        if unicodedata.category(c) != "Mn"
    )
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def ciudad_to_out(ciudad) -> dict:
    """Fila Ciudad -> payload API con slug."""
    return {
        "id": ciudad.id,
        "nombre": ciudad.nombre,
        "departamento": ciudad.departamento,
        "slug": slugify(ciudad.nombre),
        "activo": bool(ciudad.activo),
    }
