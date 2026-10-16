"""AlojaU - 017: índice + check para telegram_chat_id (Bloque 1 fix).

Revision ID: 017_telegram_chat_id_idx
Revises: 016_idempotency_keys

- telegram_chat_id ya es VARCHAR(32) (correcto para IDs de 64 bits de
  Telegram, sin overflow de INTEGER 32 bits). Esta migración es aditiva:
  + CHECK de formato (solo dígitos con opcional "-" para grupos, 5-20 chars)
  + índice para el lookup del webhook/OTP.
- No UNIQUE por defecto (un chat podría re-vincularse tras cambio de cuenta;
  el webhook sobrescribe). Idempotente.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '017_telegram_chat_id_idx'
down_revision: Union[str, None] = '016_idempotency_keys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_usuarios_telegram_chat "
        "ON usuarios(telegram_chat_id)"
    ))
    # CHECK aditivo: solo si la columna existe y sin romper filas NULL.
    # Postgres no tiene CREATE CONSTRAINT IF NOT EXISTS, se protege con DO block.
    op.execute(sa.text(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chk_telegram_chat_fmt'
          ) THEN
            ALTER TABLE usuarios ADD CONSTRAINT chk_telegram_chat_fmt
              CHECK (telegram_chat_id IS NULL OR telegram_chat_id ~ '^-?[0-9]{5,20}$');
          END IF;
        END
        $$;
        """
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_telegram_chat_fmt"
    ))
    op.execute(sa.text("DROP INDEX IF EXISTS idx_usuarios_telegram_chat"))
