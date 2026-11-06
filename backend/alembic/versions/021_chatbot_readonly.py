"""AlojaU - 021: capa de datos de SOLO LECTURA para el chatbot (rol + vistas).

Revision ID: 021_chatbot_readonly
Revises: 020_notificacion_telegram

Espejo de backend/db/migrations/021_chatbot_readonly.py -> .sql (ese archivo
manda en Supabase/CI; este en `alembic upgrade`). Mismo efecto, ambos
idempotentes. En Alembic la idempotencia del rol es por código (consulta
pg_roles) porque CREATE ROLE no admite IF NOT EXISTS; las vistas usan
CREATE OR REPLACE y los REVOKE/GRANT son repetibles.

Contenido: rol `chatbot_ro` (NOLOGIN, CONNECTION LIMIT 5, statement_timeout
3s, default_transaction_read_only=on) + 9 vistas chat_v_* con
security_barrier + lockdown (REVOKE todo, SELECT solo en las vistas).
El LOGIN + password del rol es paso manual documentado en el .sql
(SQL Editor como superuser; secreto a Render, NUNCA al repo).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '021_chatbot_readonly'
down_revision: Union[str, None] = '020_notificacion_telegram'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VISTAS = [
    "chat_v_publicaciones",
    "chat_v_publicacion_servicios",
    "chat_v_publicacion_campus",
    "chat_v_imagenes",
    "chat_v_campus",
    "chat_v_ciudades",
    "chat_v_zonas",
    "chat_v_housing_types",
    "chat_v_servicios",
]

# (tabla, columna) que deben existir ((005-020 aplicadas). (None, None) =
# solo tabla. Réplica del bloque 0 del .sql; si falta algo se aborta con
# mensaje claro en vez de crear vistas rotas.
_PRECHEQ_TABLAS = [
    "system_settings", "vistas_dedup", "housing_types", "telegram_vinculos",
    "idempotency_keys", "busquedas_guardadas", "notificaciones",
]
_PRECHEQ_COLUMNAS = [
    ("publicaciones", "barrio_texto"),
    ("usuarios", "eliminado_en"),
    ("usuarios", "telegram_chat_id"),
]


def _prechequeo_005_020(conn) -> None:
    faltantes: list[str] = []
    for tabla in _PRECHEQ_TABLAS:
        hay = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:t"
        ), {"t": tabla}).first()
        if not hay:
            faltantes.append(tabla)
    for tabla, col in _PRECHEQ_COLUMNAS:
        hay = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
        ), {"t": tabla, "c": col}).first()
        if not hay:
            faltantes.append(f"{tabla}.{col}")
    hay_uq = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE table_schema='public' AND table_name='vistas_dedup' "
        "AND constraint_name='uq_vista_pub_marca'"
    )).first()
    if not hay_uq:
        faltantes.append("uq_vista_pub_marca")
    hay_fk = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE table_schema='public' AND table_name='publicaciones' "
        "AND constraint_type='FOREIGN KEY'"
    )).first()
    if not hay_fk:
        faltantes.append("FKs:publicaciones")
    if faltantes:
        raise RuntimeError(
            "021 ABORTADA: faltan objetos de migraciones 005-020: "
            + ", ".join(faltantes) + ". Aplícalas primero (en orden)."
        )


_VISTA_PUBLICACIONES = """
CREATE OR REPLACE VIEW chat_v_publicaciones WITH (security_barrier = true) AS
SELECT p.id,
       p.titulo,
       p.descripcion,
       p.tipo_inmueble,
       p.canon_mensual,
       p.deposito_requerido,
       p.incluye_servicios_base,
       p.reglas_convivencia,
       p.direccion_referencial,
       p.latitud,
       p.longitud,
       p.fecha_publicacion,
       p.fecha_renovacion,
       p.fecha_expiracion,
       p.zona_barrio_id,
       p.barrio_texto,
       zb.nombre AS zona_nombre,
       c.nombre AS ciudad_nombre,
       (u.telefono_verificado AND u.telefono_whatsapp IS NOT NULL) AS tiene_telefono,
       (SELECT COUNT(*) FROM imagenes_publicacion i
         WHERE i.publicacion_id = p.id) AS num_fotos,
       (SELECT COUNT(*) FROM reportes_publicacion r
         WHERE r.publicacion_id = p.id
           AND r.estado IN ('PENDIENTE', 'CONFIRMADO')) AS num_reportes_activos
FROM publicaciones p
LEFT JOIN zonas_barrios zb ON zb.id = p.zona_barrio_id
LEFT JOIN ciudades c ON c.id = zb.ciudad_id
JOIN usuarios u ON u.id = p.usuario_id AND u.eliminado_en IS NULL
WHERE p.estado = 'ACTIVO'
"""

_VISTAS_SQL = {
    "chat_v_publicaciones": _VISTA_PUBLICACIONES,
    "chat_v_publicacion_servicios": """
CREATE OR REPLACE VIEW chat_v_publicacion_servicios WITH (security_barrier = true) AS
SELECT ps.publicacion_id,
       ps.servicio_id,
       s.nombre AS servicio_nombre
FROM publicacion_servicios ps
JOIN servicios_catalogo s ON s.id = ps.servicio_id
JOIN publicaciones p ON p.id = ps.publicacion_id AND p.estado = 'ACTIVO'
""",
    "chat_v_publicacion_campus": """
CREATE OR REPLACE VIEW chat_v_publicacion_campus WITH (security_barrier = true) AS
SELECT pc.publicacion_id,
       pc.campus_id,
       pc.distancia_geodesica_m AS distancia_m
FROM publicacion_campus pc
JOIN publicaciones p ON p.id = pc.publicacion_id AND p.estado = 'ACTIVO'
""",
    "chat_v_imagenes": """
CREATE OR REPLACE VIEW chat_v_imagenes WITH (security_barrier = true) AS
SELECT i.publicacion_id,
       i.url,
       i.orden
FROM imagenes_publicacion i
JOIN publicaciones p ON p.id = i.publicacion_id AND p.estado = 'ACTIVO'
""",
    "chat_v_campus": """
CREATE OR REPLACE VIEW chat_v_campus WITH (security_barrier = true) AS
SELECT id, ciudad_id, institucion, nombre_sede, direccion,
       latitud, longitud, categoria
FROM campus_universitarios
WHERE activo IS TRUE
""",
    "chat_v_ciudades": """
CREATE OR REPLACE VIEW chat_v_ciudades WITH (security_barrier = true) AS
SELECT id, nombre, departamento
FROM ciudades
WHERE activo IS TRUE
""",
    "chat_v_zonas": """
CREATE OR REPLACE VIEW chat_v_zonas WITH (security_barrier = true) AS
SELECT id, ciudad_id, nombre, estrato
FROM zonas_barrios
""",
    "chat_v_housing_types": """
CREATE OR REPLACE VIEW chat_v_housing_types WITH (security_barrier = true) AS
SELECT slug, nombre_visible, descripcion_tooltip, icono
FROM housing_types
WHERE esta_activo IS TRUE
""",
    "chat_v_servicios": """
CREATE OR REPLACE VIEW chat_v_servicios WITH (security_barrier = true) AS
SELECT id, nombre, categoria
FROM servicios_catalogo
""",
}


def upgrade() -> None:
    conn = op.get_bind()
    _prechequeo_005_020(conn)
    hay_rol = conn.execute(sa.text(
        "SELECT 1 FROM pg_roles WHERE rolname='chatbot_ro'"
    )).first()
    if not hay_rol:
        conn.execute(sa.text(
            "CREATE ROLE chatbot_ro WITH NOLOGIN CONNECTION LIMIT 5"
        ))
    conn.execute(sa.text("ALTER ROLE chatbot_ro WITH CONNECTION LIMIT 5"))
    conn.execute(sa.text("ALTER ROLE chatbot_ro SET statement_timeout = '3s'"))
    conn.execute(sa.text(
        "ALTER ROLE chatbot_ro SET default_transaction_read_only = on"
    ))
    for nombre in _VISTAS:
        conn.execute(sa.text(_VISTAS_SQL[nombre]))
    conn.execute(sa.text("REVOKE ALL ON SCHEMA public FROM chatbot_ro"))
    conn.execute(sa.text(
        "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chatbot_ro"
    ))
    conn.execute(sa.text(
        "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_ro"
    ))
    conn.execute(sa.text("GRANT USAGE ON SCHEMA public TO chatbot_ro"))
    for nombre in _VISTAS:
        conn.execute(sa.text(f"GRANT SELECT ON {nombre} TO chatbot_ro"))


def downgrade() -> None:
    conn = op.get_bind()
    for nombre in reversed(_VISTAS):
        conn.execute(sa.text(f"DROP VIEW IF EXISTS {nombre}"))
    # Se revoca y se elimina el rol. Falla si hay sesiones activas con ese
    # rol: cerrarlas primero. Las vistas ya no existen, nada depende del rol.
    conn.execute(sa.text("REVOKE ALL ON SCHEMA public FROM chatbot_ro"))
    conn.execute(sa.text("DROP ROLE IF EXISTS chatbot_ro"))
