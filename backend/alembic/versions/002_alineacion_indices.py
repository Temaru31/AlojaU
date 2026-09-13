"""AlojaU - OLA3/M6 alineación de índices modelos <-> DDL.

Revision ID: 002_alineacion_indices
Revises: 001_initial
Create Date: 2026-09-10

Contexto: backend/app/models/__init__.py declaraba índices que backend/db/schema.sql
no tenía (drift verificado en auditoría 2026-09-10). Esta migración los crea de forma
idempotente (IF NOT EXISTS) con los mismos nombres/columnas de los modelos.

Verificación de nombres (modelos, NO inventados):
- idx_publicaciones_vigencia -> publicaciones(fecha_renovacion)
  (NO existe columna fecha_vencimiento en el proyecto; grep confirma 0 hits).
- Tabla de imágenes: imagenes_publicacion (no "imagenes").
- Tabla de reportes: reportes_publicacion. Tabla audit: publicaciones_audit.
- idx_audit_evento sí existe en modelos y faltaba en schema.sql: se incluye
  (la lista original de 8 lo omitía; total 9 de modelos + 2 FK nuevas = 11).
- Nuevas (FK sin índice): idx_reportes_usuario, idx_audit_usuario.

Aplicar: alembic upgrade head (cuando exista env.py) o psql -f con cada statement.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '002_alineacion_indices'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDICES = [
    # (nombre, tabla, columnas)
    ("idx_zonas_ciudad", "zonas_barrios", "ciudad_id"),
    ("idx_campus_ciudad", "campus_universitarios", "ciudad_id"),
    ("idx_usuarios_rol", "usuarios", "rol"),
    ("idx_publicaciones_zona_estado", "publicaciones", "zona_barrio_id, estado"),
    ("idx_publicaciones_usuario", "publicaciones", "usuario_id"),
    ("idx_publicaciones_vigencia", "publicaciones", "fecha_renovacion"),
    ("idx_pubcampus_pub", "publicacion_campus", "publicacion_id"),
    ("idx_imagenes_pub", "imagenes_publicacion", "publicacion_id"),
    ("idx_audit_evento", "publicaciones_audit", "evento"),
    ("idx_reportes_usuario", "reportes_publicacion", "usuario_id"),
    ("idx_audit_usuario", "publicaciones_audit", "usuario_id"),
]


def upgrade() -> None:
    for name, table, cols in _INDICES:
        op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({cols})"))


def downgrade() -> None:
    for name, _table, _cols in reversed(_INDICES):
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))
