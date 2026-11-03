"""Lectura de ajustes del sistema que afectan las consultas de avisos."""
from sqlalchemy import select
from app.core.db_utils import rollback_seguro


async def leer_ajuste(db, clave: str, default: str) -> str:
    """Lee system_settings (clave UNIQUE, 1 query). Sin tabla/fila -> default."""
    try:
        from app.models import SystemSetting as _SS
        row = (await db.execute(
            select(_SS).where(_SS.clave == clave))).scalars().first()
        return row.valor if row else default
    except Exception:
        await rollback_seguro(db, "leer_ajuste")
        return default


async def vistas_publicas(db) -> bool:
    """¿Ve todo visitante el contador? Default False (prudente: dueño/admin)."""
    return (await leer_ajuste(db, "vistas_visibles_publico", "false")).lower() == "true"
