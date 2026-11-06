"""AlojaU - 015: vinculación Telegram persistente (Bloque 2).

Revision ID: 015_telegram_vinculos
Revises: 014_telegram_chat_id

- telegram_vinculos(nonce PK, usuario_id FK CASCADE, expira_en, usado).
- Los nonces HMAC vivían solo en memoria: redeploy/2ª instancia los
  invalidaba. Espejo SQL en db/migrations/015_telegram_vinculos.sql.
Aditivo e idempotente.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '015_telegram_vinculos'
down_revision: Union[str, None] = '014_telegram_chat_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        """CREATE TABLE IF NOT EXISTS telegram_vinculos (
          nonce VARCHAR(32) PRIMARY KEY,
          usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expira_en TIMESTAMPTZ NOT NULL,
          usado BOOLEAN NOT NULL DEFAULT FALSE,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"""
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_telegram_vinculos_expira ON telegram_vinculos(expira_en)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS telegram_vinculos"))
