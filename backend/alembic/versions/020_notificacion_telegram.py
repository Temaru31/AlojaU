"""AlojaU - 020: tipo 'telegram' en notificaciones (bienvenida al vincular).

Revision ID: 020_notificacion_telegram
Revises: 019_notificaciones_y_busquedas

- chk_notif_tipo pasa a ('nuevo_arriendo','moderacion','vencimiento','telegram').
- Aditiva e idempotente. Downgrade simétrico (solo si no hay filas 'telegram';
  si las hay, el downgrade falla a propósito antes que dejar datos inválidos:
  Postgres valida el CHECK al recrearlo).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '020_notificacion_telegram'
down_revision: Union[str, None] = '019_notificaciones_y_busquedas'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TIPOS = "'nuevo_arriendo','moderacion','vencimiento','telegram'"
_TIPOS_PREVIOS = "'nuevo_arriendo','moderacion','vencimiento'"


def upgrade() -> None:
    # Se tumban AMBOS nombres: el auto-generado por PG
    # (notificaciones_tipo_check, de espejos/modelos sin nombre) y el
    # nombrado. Así no conviven dos CHECKs sobre la misma columna.
    op.execute(sa.text(
        "ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notif_tipo"
    ))
    op.execute(sa.text(
        "ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check"
    ))
    op.execute(sa.text(
        f"ALTER TABLE notificaciones ADD CONSTRAINT chk_notif_tipo "
        f"CHECK (tipo IN ({_TIPOS}))"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notif_tipo"
    ))
    op.execute(sa.text(
        f"ALTER TABLE notificaciones ADD CONSTRAINT chk_notif_tipo "
        f"CHECK (tipo IN ({_TIPOS_PREVIOS}))"
    ))
