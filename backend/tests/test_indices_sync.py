"""OLA3/M6 regresión: modelos, schema.sql y migraciones alineados.
Si alguien añade un Index() en modelos sin su CREATE INDEX en schema.sql/migración, falla.
004 POIs: los índices nuevos viven en su propia migración (002 cubrió el drift original).
"""
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
MODELS = REPO / "app" / "models" / "__init__.py"
SCHEMA = REPO / "db" / "schema.sql"
MIG_001 = REPO / "alembic" / "versions" / "001_initial_schema.py"
MIG_002 = REPO / "alembic" / "versions" / "002_alineacion_indices.py"
MIG_004 = REPO / "alembic" / "versions" / "004_pois_categoria.py"
SQL_004 = REPO / "db" / "004_pois_categoria.sql"

# Índices nuevos de FK (no están en modelos: solo en schema.sql + 002).
NUEVOS_FK = ["idx_reportes_usuario", "idx_audit_usuario"]

# Índices nacidos en la 004 (viven en 004_pois_categoria, no en la 002).
POST_002 = ["idx_campus_ciudad_categoria"]

# v13 Enterprise Auth: índices nacidos en la 007 (cobertura propia abajo).
POST_007 = ["idx_ratelimit_clave_creado", "idx_otp_email_creado",
            "idx_pwreset_email_creado", "idx_sesiones_usuario"]
MIG_007 = REPO / "alembic" / "versions" / "007_auth_enterprise.py"
SQL_007 = REPO / "db" / "migrations" / "007_auth_enterprise.sql"

# v13.1 soft-delete: índice nacido en la 008 (cobertura propia abajo).
POST_008 = ["idx_usuarios_eliminado"]
MIG_008 = REPO / "alembic" / "versions" / "008_cuenta_soft_delete.py"
SQL_008 = REPO / "db" / "migrations" / "008_cuenta_soft_delete.sql"

# v15.2 vistas: índice nacido en la 011 (cobertura propia abajo).
POST_011 = ["idx_vistas_dedup_dia"]
MIG_011 = REPO / "alembic" / "versions" / "011_metrica_vistas.py"
SQL_011 = REPO / "db" / "migrations" / "011_metrica_vistas.sql"

# Bloque 2: índices nacidos en la 015/016 (cobertura propia abajo).
POST_015 = ["idx_telegram_vinculos_expira"]
MIG_015 = REPO / "alembic" / "versions" / "015_telegram_vinculos.py"
SQL_015 = REPO / "db" / "migrations" / "015_telegram_vinculos.sql"
POST_016 = ["idx_idempotency_expira"]
MIG_016 = REPO / "alembic" / "versions" / "016_idempotency_keys.py"
SQL_016 = REPO / "db" / "migrations" / "016_idempotency_keys.sql"

# Bloque 1 fix: índice de lookup + CHECK nacidos en la 017.
POST_017 = ["idx_usuarios_telegram_chat"]
MIG_017 = REPO / "alembic" / "versions" / "017_telegram_chat_id_idx.py"
SQL_017 = REPO / "db" / "migrations" / "017_telegram_chat_id_idx.sql"

# Opción A: índice de pendiente nacido en la 018.
POST_018 = ["idx_telegram_vinculos_chat"]
MIG_018 = REPO / "alembic" / "versions" / "018_telegram_contacto.py"
SQL_018 = REPO / "db" / "migrations" / "018_telegram_contacto.sql"

# Fase 1 notificaciones: índices nacidos en la 019.
POST_019 = ["idx_bg_matching", "idx_notif_bandeja", "idx_notif_noleidas"]
MIG_019 = REPO / "alembic" / "versions" / "019_notificaciones_y_busquedas.py"
SQL_019 = REPO / "db" / "migrations" / "019_notificaciones_y_busquedas.sql"


def _model_index_names() -> list[str]:
    return re.findall(r'Index\("([^"]+)"', MODELS.read_text(encoding="utf-8"))


def test_modelos_tienen_indices_en_schema_sql():
    schema = SCHEMA.read_text(encoding="utf-8")
    faltantes = [n for n in _model_index_names() if n not in schema]
    assert not faltantes, f"Índices de modelos ausentes en schema.sql: {faltantes}"


def test_migracion_002_cubre_drift_y_fk_nuevas():
    mig = MIG_002.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    # Todos los índices de modelos deben estar en la 002 (fue el drift original)...
    for n in _model_index_names():
        # ...salvo los que ya existían en schema.sql antes de OLA3 (no necesitan migración)...
        if n in ("idx_publicaciones_estado_canon", "idx_pubcampus_campus_dist",
                 "idx_reportes_pub_estado", "idx_audit_pub"):
            continue
        # ...y salvo los nacidos en migraciones posteriores (tienen su propia cobertura).
        if n in POST_002 or n in POST_007 or n in POST_008 or n in POST_011 \
                or n in POST_015 or n in POST_016 or n in POST_017 or n in POST_018 \
                or n in POST_019:
            continue
        assert n in mig, f"{n} falta en 002_alineacion_indices.py"
    # ...y las FK nuevas en ambos lados.
    for n in NUEVOS_FK:
        assert n in mig, f"{n} falta en 002"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_004_cubre_indices_posteriores():
    """004 POIs: sus índices están en la migración 004 + SQL canónico + schema.sql."""
    mig = MIG_004.read_text(encoding="utf-8")
    sql = SQL_004.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "003_busqueda_fts" in mig
    for n in POST_002:
        assert n in sql, f"{n} falta en 004_pois_categoria.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_002_encadena_001_y_001_sin_rutas_absolutas():
    mig002 = MIG_002.read_text(encoding="utf-8")
    assert "down_revision" in mig002 and "001_initial" in mig002
    mig001 = MIG_001.read_text(encoding="utf-8")
    assert "/home/" not in mig001 and "/Users/" not in mig001, "001 aún tiene rutas absolutas"
    assert 'revision' in mig002 and '002_alineacion_indices' in mig002


def test_migracion_007_cubre_indices_auth():
    """v13: los índices de rate_limit/otp/resets/sesiones viven en la 007."""
    mig = MIG_007.read_text(encoding="utf-8")
    sql = SQL_007.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "006_barrio_texto" in mig
    for n in POST_007:
        assert n in mig, f"{n} falta en 007_auth_enterprise.py"
        assert n in sql, f"{n} falta en 007_auth_enterprise.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_008_cubre_indice_soft_delete():
    """v13.1: idx_usuarios_eliminado vive en la 008."""
    mig = MIG_008.read_text(encoding="utf-8")
    sql = SQL_008.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "007_auth_enterprise" in mig
    for n in POST_008:
        assert n in mig, f"{n} falta en 008_cuenta_soft_delete.py"
        assert n in sql, f"{n} falta en 008_cuenta_soft_delete.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_011_cubre_indice_vistas():
    """v15.2: idx_vistas_dedup_dia vive en la 011."""
    mig = MIG_011.read_text(encoding="utf-8")
    sql = SQL_011.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "010_fk_cascade_and_sequences" in mig
    for n in POST_011:
        assert n in mig, f"{n} falta en 011_metrica_vistas.py"
        assert n in sql, f"{n} falta en 011_metrica_vistas.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_015_cubre_indice_telegram():
    """Bloque 2: idx_telegram_vinculos_expira vive en la 015."""
    mig = MIG_015.read_text(encoding="utf-8")
    sql = SQL_015.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "014_telegram_chat_id" in mig
    for n in POST_015:
        assert n in mig, f"{n} falta en 015_telegram_vinculos.py"
        assert n in sql, f"{n} falta en 015_telegram_vinculos.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_016_cubre_indice_idempotencia():
    """Bloque 2: idx_idempotency_expira vive en la 016."""
    mig = MIG_016.read_text(encoding="utf-8")
    sql = SQL_016.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "015_telegram_vinculos" in mig
    for n in POST_016:
        assert n in mig, f"{n} falta en 016_idempotency_keys.py"
        assert n in sql, f"{n} falta en 016_idempotency_keys.sql"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_017_cubre_indice_y_check_telegram():
    """Bloque 1 fix: idx + CHECK de telegram_chat_id viven en la 017."""
    mig = MIG_017.read_text(encoding="utf-8")
    sql = SQL_017.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "016_idempotency_keys" in mig
    for n in POST_017:
        assert n in mig, f"{n} falta en 017_telegram_chat_id_idx.py"
        assert n in sql, f"{n} falta en 017_telegram_chat_id_idx.sql"
        assert n in schema, f"{n} falta en schema.sql"
    for pieza in ("chk_telegram_chat_fmt", "telegram_chat_id ~"):
        assert pieza in mig, f"{pieza} falta en 017_telegram_chat_id_idx.py"
        assert pieza in sql, f"{pieza} falta en 017_telegram_chat_id_idx.sql"
        assert pieza in schema, f"{pieza} falta en schema.sql"


def test_migracion_018_cubre_indice_pendiente():
    """Opción A: idx_telegram_vinculos_chat + columna viven en la 018."""
    mig = MIG_018.read_text(encoding="utf-8")
    sql = SQL_018.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "017_telegram_chat_id_idx" in mig
    for n in POST_018:
        assert n in mig, f"{n} falta en 018_telegram_contacto.py"
        assert n in sql, f"{n} falta en 018_telegram_contacto.sql"
        assert n in schema, f"{n} falta en schema.sql"
    assert "chat_id_pendiente" in mig and "chat_id_pendiente" in sql
    assert "chat_id_pendiente" in schema
    modelos = MODELS.read_text(encoding="utf-8")
    assert "chat_id_pendiente" in modelos, "columna ausente en modelos"


def test_migracion_019_cubre_indices_notificaciones():
    """Fase 1: idx_bg_matching + idx_notif_* viven en la 019."""
    mig = MIG_019.read_text(encoding="utf-8")
    sql = SQL_019.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "018_telegram_contacto" in mig
    for n in POST_019:
        assert n in mig, f"{n} falta en 019_notificaciones_y_busquedas.py"
        assert n in sql, f"{n} falta en 019_notificaciones_y_busquedas.sql"
        assert n in schema, f"{n} falta en schema.sql"
    for pieza in ("busquedas_guardadas", "notificaciones", "evento_id",
                  "uq_notif_usuario_evento", "chk_bg_rango", "chk_notif_tipo"):
        assert pieza in mig, f"{pieza} falta en 019_notificaciones_y_busquedas.py"
        assert pieza in sql, f"{pieza} falta en 019_notificaciones_y_busquedas.sql"
        assert pieza in schema, f"{pieza} falta en schema.sql"
    modelos = MODELS.read_text(encoding="utf-8")
    assert "class BusquedaGuardada" in modelos and "class Notificacion" in modelos
