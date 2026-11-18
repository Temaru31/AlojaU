"""AlojaU - 023: retirar la capa de datos del chatbot (reemplaza a la 021).

Revision ID: 023_retirar_chatbot_readonly
Revises: 022_publicidad_destacados

Espejo de backend/db/migrations/023_retirar_chatbot_readonly.sql (ese archivo
manda en Supabase/CI; este en `alembic upgrade`). Mismo efecto, ambos
idempotentes (DROP ... IF EXISTS; el rol se consulta en pg_roles).

El chatbot ya no consulta la BD: elimina las 9 vistas `chat_v_*` y el rol
`chatbot_ro` creados por la 021. No toca tablas ni datos. Si el rol tiene
sesiones abiertas, el DROP ROLE falla: cerrarlas y re-ejecutar.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '023_retirar_chatbot_readonly'
down_revision: Union[str, None] = '022_publicidad_destacados'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VISTAS = [
    "chat_v_servicios",
    "chat_v_housing_types",
    "chat_v_zonas",
    "chat_v_ciudades",
    "chat_v_campus",
    "chat_v_imagenes",
    "chat_v_publicacion_campus",
    "chat_v_publicacion_servicios",
    "chat_v_publicaciones",
]


def upgrade() -> None:
    conn = op.get_bind()
    for nombre in _VISTAS:
        conn.execute(sa.text(f"DROP VIEW IF EXISTS {nombre}"))
    existe = conn.execute(sa.text(
        "SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_ro'")).first()
    if existe:
        conn.execute(sa.text("REVOKE ALL ON SCHEMA public FROM chatbot_ro"))
        conn.execute(sa.text(
            "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chatbot_ro"))
        conn.execute(sa.text(
            "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_ro"))
        conn.execute(sa.text("DROP ROLE chatbot_ro"))


def downgrade() -> None:
    # Re-crear la capa del chatbot = re-aplicar 021_chatbot_readonly (SQL).
    # Se deja sin efecto a propósito: el chatbot ya no usa esta capa.
    pass
