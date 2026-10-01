"""AlojaU - 014: Telegram DM $0 (M5 privacidad).

Revision ID: 014_telegram_chat_id
Revises: 013_housing_types

- usuarios.telegram_chat_id VARCHAR(32) NULL (sin vincular = NULL).
- Bugfix: OTP solo por DM a este chat_id; nunca a canales/grupos.
Aditivo e idempotente.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '014_telegram_chat_id'
down_revision: Union[str, None] = '013_housing_types'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32)"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE usuarios DROP COLUMN IF EXISTS telegram_chat_id"))
