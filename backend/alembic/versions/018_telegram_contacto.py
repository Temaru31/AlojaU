"""AlojaU - 018: chat pendiente para verificación por contacto (Opción A).

Revision ID: 018_telegram_contacto
Revises: 017_telegram_chat_id_idx

- telegram_vinculos.chat_id_pendiente NULL: el /start guarda QUÉ chat pidió
  el enlace; la vinculación solo ocurre al recibir el contacto compartido
  (request_contact) cuyo número coincida con el teléfono verificado.
- Aditiva e idempotente.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '018_telegram_contacto'
down_revision: Union[str, None] = '017_telegram_chat_id_idx'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE telegram_vinculos "
        "ADD COLUMN IF NOT EXISTS chat_id_pendiente VARCHAR(32)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_telegram_vinculos_chat "
        "ON telegram_vinculos(chat_id_pendiente)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_telegram_vinculos_chat"))
    op.execute(sa.text(
        "ALTER TABLE telegram_vinculos DROP COLUMN IF EXISTS chat_id_pendiente"
    ))
