"""AlojaU - 024: fijar search_path en las funciones de public (aviso del asesor).

Revision ID: 024_search_path_funciones
Revises: 023_retirar_chatbot_readonly

Espejo de backend/db/migrations/024_search_path_funciones.sql (ese archivo
manda en Supabase/CI; este en `alembic upgrade`). Mismo efecto, ambos
idempotentes. Solo cambia la configuración de dos funciones; no toca datos.
"""

from typing import Sequence, Union

from alembic import op

revision: str = '024_search_path_funciones'
down_revision: Union[str, None] = '023_retirar_chatbot_readonly'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FUNCIONES = (
    "public.haversine_m(double precision, double precision, double precision, double precision)",
    "public.trg_fn_publicacion_recalcular_distancias()",
)


def upgrade() -> None:
    for firma in _FUNCIONES:
        op.execute(f"ALTER FUNCTION {firma} SET search_path = public, pg_temp")


def downgrade() -> None:
    for firma in _FUNCIONES:
        op.execute(f"ALTER FUNCTION {firma} RESET search_path")
