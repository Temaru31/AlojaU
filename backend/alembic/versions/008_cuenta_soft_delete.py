"""AlojaU - 008: soft-delete de cuentas (v13.1).

Revision ID: 008_cuenta_soft_delete
Revises: 007_auth_enterprise

- usuarios.eliminado_en TIMESTAMPTZ NULL (NULL = activa).
- Índice idx_usuarios_eliminado para la purga por gracia vencida.
Aditivo e idempotente. Aplicar: alembic upgrade head o el espejo SQL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '008_cuenta_soft_delete'
down_revision: Union[str, None] = '007_auth_enterprise'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_usuarios_eliminado ON usuarios(eliminado_en)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_usuarios_eliminado"))
    op.execute(sa.text("ALTER TABLE usuarios DROP COLUMN IF EXISTS eliminado_en"))
