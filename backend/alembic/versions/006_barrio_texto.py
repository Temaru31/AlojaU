"""AlojaU - 006: barrio libre en publicaciones (flexi-barrios).

Revision ID: 006_barrio_texto
Revises: 005_admin_automation

- publicaciones.barrio_texto VARCHAR(120) NULL (barrio personalizado).
- publicaciones.zona_barrio_id pasa a NULL (antes NOT NULL): o zona del
  catálogo o texto libre (validado en Pydantic, no en CHECK).

Aplicar: alembic upgrade head (o backend/db/migrations/006_barrio_texto.sql).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '006_barrio_texto'
down_revision: Union[str, None] = '005_admin_automation'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE publicaciones ADD COLUMN IF NOT EXISTS barrio_texto VARCHAR(120)"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones ALTER COLUMN zona_barrio_id DROP NOT NULL"
    ))


def downgrade() -> None:
    # Seguro: si existen avisos con barrio libre, se aborta antes de tocar
    # datos (reasignar a mano y reintentar).
    n = None
    conn = op.get_bind()
    n = conn.execute(sa.text(
        "SELECT count(*) FROM publicaciones WHERE zona_barrio_id IS NULL"
    )).scalar()
    if n:
        raise RuntimeError(
            f"downgrade 006 abortado: {n} aviso(s) con barrio libre; "
            "reasigna su zona_barrio_id y reintenta"
        )
    op.execute(sa.text(
        "ALTER TABLE publicaciones ALTER COLUMN zona_barrio_id SET NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones DROP COLUMN IF EXISTS barrio_texto"
    ))
