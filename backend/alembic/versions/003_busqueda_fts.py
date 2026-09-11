"""AlojaU - Oleada 2: búsqueda por texto (FTS español + trigramas).

Revision ID: 003_busqueda_fts
Revises: 002_alineacion_indices
Create Date: 2026-09-11

Contexto: GET /api/publicaciones?q=... necesita:
  1. Índice GIN Full-Text Search en español sobre titulo+descripcion
     (coincidencias de palabras completas, sin tildes por el dict spanish).
  2. Índice GIN de trigramas sobre titulo (typos / búsquedas parciales).
  3. Extensiones pg_trgm (+ unaccent para futuros fallbacks ILIKE sin tildes).

Sin pgvector, sin columnas nuevas, sin downtime: solo extensiones e índices
IF NOT EXISTS. Compatible con Supabase (ejecutar este mismo SQL en el
SQL Editor si el rol pooler no puede CREATE EXTENSION).

Aplicar: alembic upgrade head — o copiar los statements a Supabase SQL Editor.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '003_busqueda_fts'
down_revision: Union[str, None] = '002_alineacion_indices'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS unaccent"))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_publicaciones_fts ON publicaciones "
        "USING gin(to_tsvector('spanish', coalesce(titulo, '') || ' ' || coalesce(descripcion, '')))"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_publicaciones_trgm ON publicaciones "
        "USING gin(titulo gin_trgm_ops)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_publicaciones_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS idx_publicaciones_fts"))
    # NOTA: no se dropean las extensiones (compartidas con otras features).
