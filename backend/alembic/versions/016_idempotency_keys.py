"""AlojaU - 016: claves de idempotencia (Bloque 2).

Revision ID: 016_idempotency_keys
Revises: 015_telegram_vinculos

- idempotency_keys(clave, usuario_id, ruta) PK compuesta + respuesta
  guardada + expiración 24h. Cierra la carrera de doble-creación entre el
  lookup y el insert (UNIQUE -> replay). Espejo SQL en
  db/migrations/016_idempotency_keys.sql. Aditivo e idempotente.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '016_idempotency_keys'
down_revision: Union[str, None] = '015_telegram_vinculos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        """CREATE TABLE IF NOT EXISTS idempotency_keys (
          clave VARCHAR(64) NOT NULL,
          usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          ruta VARCHAR(120) NOT NULL,
          codigo INTEGER NOT NULL DEFAULT 201,
          cuerpo JSONB NOT NULL,
          expira_en TIMESTAMPTZ NOT NULL,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (clave, usuario_id, ruta)
        )"""
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_idempotency_expira ON idempotency_keys(expira_en)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS idempotency_keys"))
