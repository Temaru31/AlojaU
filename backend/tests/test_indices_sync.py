"""OLA3/M6 regresión: modelos, schema.sql y migración 002 alineados.
Si alguien añade un Index() en modelos sin su CREATE INDEX en schema.sql/002, falla.
"""
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
MODELS = REPO / "app" / "models" / "__init__.py"
SCHEMA = REPO / "db" / "schema.sql"
MIG_001 = REPO / "alembic" / "versions" / "001_initial_schema.py"
MIG_002 = REPO / "alembic" / "versions" / "002_alineacion_indices.py"

# Índices nuevos de FK (no están en modelos: solo en schema.sql + 002).
NUEVOS_FK = ["idx_reportes_usuario", "idx_audit_usuario"]


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
        # ...salvo los que ya existían en schema.sql antes de OLA3 (no necesitan migración).
        if n in ("idx_publicaciones_estado_canon", "idx_pubcampus_campus_dist",
                 "idx_reportes_pub_estado", "idx_audit_pub"):
            continue
        assert n in mig, f"{n} falta en 002_alineacion_indices.py"
    # ...y las FK nuevas en ambos lados.
    for n in NUEVOS_FK:
        assert n in mig, f"{n} falta en 002"
        assert n in schema, f"{n} falta en schema.sql"


def test_migracion_002_encadena_001_y_001_sin_rutas_absolutas():
    mig002 = MIG_002.read_text(encoding="utf-8")
    assert "down_revision" in mig002 and "001_initial" in mig002
    mig001 = MIG_001.read_text(encoding="utf-8")
    assert "/home/" not in mig001 and "/Users/" not in mig001, "001 aún tiene rutas absolutas"
    assert 'revision' in mig002 and '002_alineacion_indices' in mig002
