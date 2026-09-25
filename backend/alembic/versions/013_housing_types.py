"""AlojaU - 013: tipos de vivienda dinámicos (M2).

Revision ID: 013_housing_types
Revises: 012_eventos_auditoria

- housing_types(slug PK, nombre_visible, descripcion_tooltip, icono, esta_activo).
- Backfill con slugs históricos (nunca renombrar/eliminar).
- Reemplaza CHECK chk_tipo por FK RESTRICT (evita borrar slugs en uso).
Aditivo e idempotente. Aplicar: alembic upgrade head o el espejo SQL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '013_housing_types'
down_revision: Union[str, None] = '012_eventos_auditoria'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        """CREATE TABLE IF NOT EXISTS housing_types (
          slug VARCHAR(40) PRIMARY KEY,
          nombre_visible VARCHAR(80) NOT NULL,
          descripcion_tooltip TEXT,
          icono VARCHAR(20),
          esta_activo BOOLEAN NOT NULL DEFAULT TRUE
        )"""
    ))
    op.execute(sa.text(
        """INSERT INTO housing_types (slug, nombre_visible, descripcion_tooltip, icono, esta_activo) VALUES
          ('HABITACION_FAMILIAR', 'Habitación familiar', 'Habitación en casa de familia, ambiente compartido', '🏠', TRUE),
          ('HABITACION_INDEPENDIENTE', 'Habitación independiente', 'Habitación privada con acceso independiente', '🚪', TRUE),
          ('APARTAESTUDIO', 'Apartaestudio', 'Ambiente integrado con cocina y baño privados', '🏢', TRUE),
          ('COMPARTIDO', 'Compartido', 'Cupo en vivienda compartida con otros estudiantes', '🤝', TRUE),
          ('APARTAMENTO_COMPLETO', 'Apartamento completo', 'Apartamento entero para ti o tu grupo', '🏘️', TRUE),
          ('HABITACION_PISO_COMPARTIDO', 'Habitación en piso compartido', 'Habitación privada en piso con zonas comunes', '🏡', TRUE)
        ON CONFLICT (slug) DO NOTHING"""
    ))
    op.execute(sa.text("ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS chk_tipo"))
    op.execute(sa.text(
        "ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS publicaciones_tipo_inmueble_check"))
    op.execute(sa.text(
        """DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_publicaciones_tipo') THEN
            ALTER TABLE publicaciones ADD CONSTRAINT fk_publicaciones_tipo
              FOREIGN KEY (tipo_inmueble) REFERENCES housing_types(slug)
              ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END
        $$"""
    ))


def downgrade() -> None:
    # No se revierte el backfill (los avisos podrían referenciar nuevos slugs).
    # Solo se elimina la FK si existe (el CHECK original no se restaura para
    # no romper avisos con slugs dinámicos creados tras el upgrade).
    op.execute(sa.text(
        "ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS fk_publicaciones_tipo"))
