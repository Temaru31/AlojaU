"""Ajustes del sistema que afectan las consultas de avisos."""
from app.repositories import ajustes_repo


async def vistas_publicas(db) -> bool:
    """¿Ve todo visitante el contador? Default False (prudente: dueño/admin)."""
    return await ajustes_repo.leer_bool(db, "vistas_visibles_publico")
