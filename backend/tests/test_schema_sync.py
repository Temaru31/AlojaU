"""Regresión anti-drift schema.sql <-> modelos/migraciones/seed (fallo CI backend).

Origen: CI inicializa PG solo desde db/schema.sql mientras las BD de dev se
migraron incrementalmente (005 estados/settings/trigger, 006 barrio_texto).
El drift rompía el seed (PAUSADO_POR_REPORTE violaba el CHECK) y las queries
ORM (columna barrio_texto inexistente). Todo file-level: corre sin PG.
"""
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
SCHEMA = REPO / "db" / "schema.sql"
MODELS = REPO / "app" / "models" / "__init__.py"
MIG_005 = REPO / "db" / "migrations" / "005_fix_estado_and_campus.sql"
MIG_006 = REPO / "db" / "migrations" / "006_barrio_texto.sql"

# 9 estados canónicos (modelos chk_estado + migración 005 + seed v7).
ESTADOS = [
    "PENDIENTE", "ACTIVO", "PAUSADO", "ARRENDADO", "EXPIRADO",
    "RECHAZADO", "DESACTIVADO", "PAUSADO_POR_REPORTE", "REVISION_REQUERIDA",
]


def test_schema_estado_acepta_los_9_estados():
    schema = SCHEMA.read_text(encoding="utf-8")
    m = re.search(r"estado IN \((.*?)\)", schema, re.DOTALL)
    assert m, "CHECK de estado no encontrado en schema.sql"
    faltantes = [e for e in ESTADOS if f"'{e}'" not in m.group(1)]
    assert not faltantes, f"estados ausentes en schema.sql: {faltantes}"


def test_schema_barrio_texto_nullable_y_zona_opcional():
    schema = SCHEMA.read_text(encoding="utf-8")
    assert re.search(r"barrio_texto VARCHAR\(120\)", schema), \
        "barrio_texto (006) ausente en schema.sql"
    m = re.search(r"zona_barrio_id BIGINT ([^,]*)", schema)
    assert m and "NOT NULL" not in m.group(1), \
        "zona_barrio_id debe ser NULL en schema.sql (006 flexi-barrios)"


def test_schema_trae_trigger_distancias_y_system_settings():
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "trg_fn_publicacion_recalcular_distancias" in schema, \
        "trigger de distancias (004/005) ausente en schema.sql"
    assert "trg_publicacion_recalcular_distancias" in schema
    assert "system_settings" in schema, \
        "tabla system_settings (005) ausente en schema.sql"


def test_migraciones_y_modelos_coinciden_con_schema():
    modelos = MODELS.read_text(encoding="utf-8")
    mig005 = MIG_005.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    for e in ESTADOS:
        assert f"'{e}'" in modelos, f"{e} ausente en modelos"
        assert f"'{e}'" in mig005, f"{e} ausente en migración 005"
        assert f"'{e}'" in schema, f"{e} ausente en schema.sql"
    assert "barrio_texto VARCHAR(120)" in MIG_006.read_text(encoding="utf-8")
