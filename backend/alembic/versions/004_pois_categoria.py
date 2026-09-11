"""AlojaU - 004: POIs por categoría (aditivo, sin renombres).

Revision ID: 004_pois_categoria
Revises: 003_busqueda_fts

Ejecuta el SQL canónico backend/db/004_pois_categoria.sql (misma fuente que se
pega en Supabase SQL Editor: cero deriva). Ver decisión de arquitectura en el
encabezado del .sql (no se renombra campus_universitarios ni publicacion_campus).

Aplicar: alembic upgrade head.
"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op

# revision identifiers
revision: str = '004_pois_categoria'
down_revision: Union[str, None] = '003_busqueda_fts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SQL = Path(__file__).resolve().parent.parent.parent / "db" / "004_pois_categoria.sql"


def upgrade() -> None:
    with open(_SQL, encoding="utf-8") as f:
        op.execute(f.read())


def downgrade() -> None:
    # Revierte automatización e índices; la COLUMNA se conserva a propósito
    # (borrarla destruiría las categorías cargadas; el CHECK/índice fuera
    # basta para volver al comportamiento 003).
    op.execute("DROP TRIGGER IF EXISTS trg_publicacion_recalcular_distancias ON publicaciones")
    op.execute("DROP FUNCTION IF EXISTS trg_fn_publicacion_recalcular_distancias()")
    op.execute("DROP INDEX IF EXISTS idx_campus_ciudad_categoria")
    op.execute("ALTER TABLE campus_universitarios DROP CONSTRAINT IF EXISTS chk_campus_categoria")
