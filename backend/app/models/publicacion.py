"""Compatibilidad: re-exporta modelos desde app.models para routers legacy."""
from . import (
    Base,
    Ciudad,
    ZonaBarrio,
    CampusUniversitario,
    Usuario,
    Publicacion,
    ServicioCatalogo,
    PublicacionServicio,
    PublicacionCampus,
    ImagenPublicacion,
    ReportePublicacion,
    PublicacionesAudit,
)
# Alias legacy usado en routers
PublicacionAudit = PublicacionesAudit

__all__ = [
    "Base",
    "Ciudad",
    "ZonaBarrio",
    "CampusUniversitario",
    "Usuario",
    "Publicacion",
    "ServicioCatalogo",
    "PublicacionServicio",
    "PublicacionCampus",
    "ImagenPublicacion",
    "ReportePublicacion",
    "PublicacionesAudit",
    "PublicacionAudit",
]
