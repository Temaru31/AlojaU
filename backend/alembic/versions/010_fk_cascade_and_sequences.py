"""AlojaU - 010: FK ON DELETE + secuencias (v14.1).

Revision ID: 010_fk_cascade_and_sequences
Revises: 009_profile_jsonb_preferences

Alinea DDL con los modelos (app/models/__init__.py), que ya declaran estos
ON DELETE pero schema.sql/migraciones previas no los crearon:
- CASCADE: zonas_barrios.ciudad, campus.ciudad, publicaciones.usuario,
  publicacion_servicios.servicio, publicacion_campus.campus.
- SET NULL: reportes.usuario, publicaciones_audit.usuario.
Sin esto la purga física de cuentas falla en BD creadas desde schema.sql.
- setval() de secuencias tras seed con ids explícitos (evita colisiones).

Aditivo e idempotente (DROP IF EXISTS + ADD). Aplicar: alembic upgrade head
o el espejo SQL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '010_fk_cascade_and_sequences'
down_revision: Union[str, None] = '009_profile_jsonb_preferences'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FKS = [
    # (tabla, constraint, columna, referencia, acción)
    ("zonas_barrios", "zonas_barrios_ciudad_id_fkey",
     "ciudad_id", "ciudades(id)", "CASCADE"),
    ("campus_universitarios", "campus_universitarios_ciudad_id_fkey",
     "ciudad_id", "ciudades(id)", "CASCADE"),
    ("publicaciones", "publicaciones_usuario_id_fkey",
     "usuario_id", "usuarios(id)", "CASCADE"),
    ("publicacion_servicios", "publicacion_servicios_servicio_id_fkey",
     "servicio_id", "servicios_catalogo(id)", "CASCADE"),
    ("publicacion_campus", "publicacion_campus_campus_id_fkey",
     "campus_id", "campus_universitarios(id)", "CASCADE"),
    ("reportes_publicacion", "reportes_publicacion_usuario_id_fkey",
     "usuario_id", "usuarios(id)", "SET NULL"),
    ("publicaciones_audit", "publicaciones_audit_usuario_id_fkey",
     "usuario_id", "usuarios(id)", "SET NULL"),
]

_SEQS = [
    ("ciudades", "ciudades_id_seq"),
    ("zonas_barrios", "zonas_barrios_id_seq"),
    ("campus_universitarios", "campus_universitarios_id_seq"),
    ("servicios_catalogo", "servicios_catalogo_id_seq"),
    ("usuarios", "usuarios_id_seq"),
    ("publicaciones", "publicaciones_id_seq"),
    ("reportes_publicacion", "reportes_publicacion_id_seq"),
    ("imagenes_publicacion", "imagenes_publicacion_id_seq"),
    ("publicaciones_audit", "publicaciones_audit_id_seq"),
]


def upgrade() -> None:
    for tabla, constr, col, ref, accion in _FKS:
        op.execute(sa.text(
            f"ALTER TABLE {tabla} DROP CONSTRAINT IF EXISTS {constr}"
        ))
        op.execute(sa.text(
            f"ALTER TABLE {tabla} ADD CONSTRAINT {constr} "
            f"FOREIGN KEY ({col}) REFERENCES {ref} ON DELETE {accion}"
        ))
    for tabla, seq in _SEQS:
        op.execute(sa.text(
            f"SELECT setval('{seq}', COALESCE((SELECT max(id) FROM {tabla}), 1), true)"
        ))


def downgrade() -> None:
    # Revierte a FK sin acción (estado pre-010). No toca secuencias ni datos.
    for tabla, constr, col, ref, _accion in _FKS:
        op.execute(sa.text(
            f"ALTER TABLE {tabla} DROP CONSTRAINT IF EXISTS {constr}"
        ))
        op.execute(sa.text(
            f"ALTER TABLE {tabla} ADD CONSTRAINT {constr} "
            f"FOREIGN KEY ({col}) REFERENCES {ref}"
        ))
