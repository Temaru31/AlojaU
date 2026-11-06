"""AlojaU - 009: perfil flexible marketplace (v13.2).

Revision ID: 009_profile_jsonb_preferences
Revises: 008_cuenta_soft_delete

Aditivo e idempotente:
- usuarios.telefono_whatsapp pasa a NULL (CHECK solo valida no-nulos).
- usuarios.bio VARCHAR(500) NULL, foto_perfil_url VARCHAR(500) NULL.
- usuarios.preferencias JSONB NOT NULL DEFAULT '{}'.
- Backfill: placeholders '573000000000' (Google sin teléfono) -> NULL para
  que el gate de publicación (400) funcione con datos reales.
Aplicar: alembic upgrade head o el espejo SQL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '009_profile_jsonb_preferences'
down_revision: Union[str, None] = '008_cuenta_soft_delete'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE usuarios ALTER COLUMN telefono_whatsapp DROP NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio VARCHAR(500)"
    ))
    op.execute(sa.text(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil_url VARCHAR(500)"
    ))
    op.execute(sa.text(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB "
        "NOT NULL DEFAULT '{}'"
    ))
    # Backfill seguro: el placeholder de Google sin teléfono -> NULL real.
    op.execute(sa.text(
        "UPDATE usuarios SET telefono_whatsapp = NULL "
        "WHERE telefono_whatsapp = '573000000000'"
    ))


def downgrade() -> None:
    # Seguro: aborta si hay filas que perderían datos no-nulos.
    conn = op.get_bind()
    n = conn.execute(sa.text(
        "SELECT count(*) FROM usuarios WHERE telefono_whatsapp IS NULL"
    )).scalar()
    if n:
        raise RuntimeError(
            f"downgrade 009 abortado: {n} usuario(s) sin teléfono; "
            "reasigna un número y reintenta"
        )
    op.execute(sa.text("ALTER TABLE usuarios DROP COLUMN IF EXISTS preferencias"))
    op.execute(sa.text("ALTER TABLE usuarios DROP COLUMN IF EXISTS foto_perfil_url"))
    op.execute(sa.text("ALTER TABLE usuarios DROP COLUMN IF EXISTS bio"))
    op.execute(sa.text(
        "ALTER TABLE usuarios ALTER COLUMN telefono_whatsapp SET NOT NULL"
    ))
