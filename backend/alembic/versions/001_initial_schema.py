"""AlojaU - Alembic initial schema corregido PG16

Revision ID: 001_initial
Revises: 
Create Date: 2026-08-30

Fixes:
- SERIAL -> IDENTITY
- + latitud/longitud DECIMAL(10,7), indice_confianza SMALLINT 0-100
- tabla publicaciones_audit
- reportes estado PENDIENTE/DESCARTADO/CONFIRMADO
- indices NFR (estado, canon) + (campus_id, distancia)
- Factor5 bug: PENDIENTE/CONFIRMADO (no ACTIVO)

Para generar: alembic revision --autogenerate -m "fix identity audit haversine"
Para aplicar: alembic upgrade head
Para seed: psql -f backend/db/seed.sql o python backend/scripts/recalc_haversine.py
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # DDL canónico es backend/db/schema.sql (psql/Supabase).
    # Alembic lo replica via op.execute. Soporta ejecución desde backend/ o raíz.
    import pathlib
    for cand in [
        pathlib.Path("db/schema.sql"),
        pathlib.Path("backend/db/schema.sql"),
        pathlib.Path("/home/angel/Escritorio/AlojaU/backend/db/schema.sql"),
    ]:
        if cand.exists():
            op.execute(sa.text(cand.read_text(encoding="utf-8")))
            return
    # Fallback: error claro si no encuentra schema.sql
    raise FileNotFoundError("No se encontró backend/db/schema.sql - coloca DDL en esa ruta")


def downgrade() -> None:
    op.execute("""
    DROP TRIGGER IF EXISTS t_publicaciones_recalc_dist ON publicaciones;
    DROP FUNCTION IF EXISTS trg_recalc_distancia();
    DROP FUNCTION IF EXISTS haversine_m(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
    DROP VIEW IF EXISTS v_publicaciones_indice;
    DROP TABLE IF EXISTS publicaciones_audit CASCADE;
    DROP TABLE IF EXISTS reportes_publicacion CASCADE;
    DROP TABLE IF EXISTS imagenes_publicacion CASCADE;
    DROP TABLE IF EXISTS publicacion_campus CASCADE;
    DROP TABLE IF EXISTS publicacion_servicios CASCADE;
    DROP TABLE IF EXISTS servicios_catalogo CASCADE;
    DROP TABLE IF EXISTS publicaciones CASCADE;
    DROP TABLE IF EXISTS usuarios CASCADE;
    DROP TABLE IF EXISTS campus_universitarios CASCADE;
    DROP TABLE IF EXISTS zonas_barrios CASCADE;
    DROP TABLE IF EXISTS ciudades CASCADE;
    """)
