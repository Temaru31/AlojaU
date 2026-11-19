"""AlojaU - 012: auditoría generalizada (M4 historial).

Revision ID: 012_eventos_auditoria
Revises: 011_metrica_vistas

- chk_evento += SETTINGS (cambio de ajustes del sistema) y CUENTA_DELETE
  (soft-delete de cuenta). Sin ellos, auditar esos actos violaría el CHECK.
- publicaciones_audit.publicacion_id pasa a NULLABLE: un acto auditado no
  siempre refiere a un aviso (ajustes, cuentas). Relaja restricción (aditivo).
Aditivo e idempotente. Aplicar: alembic upgrade head o el espejo SQL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '012_eventos_auditoria'
down_revision: Union[str, None] = '011_metrica_vistas'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EVENTOS = ("CREATED", "APPROVED", "REJECTED", "PAUSED", "RESUMED", "RENTED",
            "EXPIRED", "RENEWED", "BLOCKED", "SETTINGS", "CUENTA_DELETE")


def upgrade() -> None:
    # OJO: el DDL histórico creó el CHECK sin nombre explícito (PG lo llamó
    # publicaciones_audit_evento_check); se dropean ambos nombres.
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS chk_evento"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS "
        "publicaciones_audit_evento_check"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit ADD CONSTRAINT chk_evento CHECK "
        f"(evento IN ({', '.join(repr(e) for e in _EVENTOS)}))"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit ALTER COLUMN publicacion_id DROP NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS chk_evento"
    ))
    op.execute(sa.text(
        "ALTER TABLE publicaciones_audit ADD CONSTRAINT chk_evento CHECK "
        "(evento IN ('CREATED','APPROVED','REJECTED','PAUSED','RESUMED',"
        "'RENTED','EXPIRED','RENEWED','BLOCKED'))"
    ))
