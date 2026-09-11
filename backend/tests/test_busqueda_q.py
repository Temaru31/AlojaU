"""Oleada 2 - Búsqueda por texto libre (FTS español + trigramas).

Criterios: A-01 (typos/parciales retornan relevantes), contrato ?q=...,
migración 003 encadenada a 002 y alineada con schema.sql.
"""
import pathlib

from fastapi.testclient import TestClient

from app.main import app
from app.models import Publicacion
from app.repositories import publicacion_repo as repo
from app.routers.publicaciones import MOCK_PUBS
from app.services.publicacion_view import filter_mock_pubs

client = TestClient(app)

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
MIG_003 = REPO / "alembic" / "versions" / "003_busqueda_fts.py"
SCHEMA = REPO / "db" / "schema.sql"


def _items(data):
    return data["items"] if isinstance(data, dict) and "items" in data else data


# --- Contrato de modos ---
def test_resolver_modo_q():
    assert repo.resolver_modo_q(None) is None
    assert repo.resolver_modo_q("   ") is None
    assert repo.resolver_modo_q("ab") == "fuzzy"
    assert repo.resolver_modo_q("hab") == "fts"
    assert repo.resolver_modo_q("  habitación  ") == "fts"


def test_lista_conditions_q_agrega_filtro_texto():
    base = repo.lista_conditions(Publicacion, None, None, None, None, None)
    fts = repo.lista_conditions(Publicacion, None, None, None, None, None, "habitacion", "fts")
    fuzzy = repo.lista_conditions(Publicacion, None, None, None, None, None, "ha", "fuzzy")
    assert len(fts) == len(base) + 1
    assert len(fuzzy) == len(base) + 1


# --- Mock matching (sin tildes, parciales) ---
def test_mock_q_sin_tilde_encuentra_con_tilde():
    res = filter_mock_pubs(MOCK_PUBS, None, None, None, None, None, "habitacion")
    assert len(res) >= 1
    # El top-1 debe ser una habitación (relevancia: título antes que descripción).
    assert "habitaci" in res[0]["titulo"].lower()


def test_mock_q_parcial():
    res = filter_mock_pubs(MOCK_PUBS, None, None, None, None, None, "apartaest")
    assert any(p["id"] == 2 for p in res)


def test_mock_q_sin_resultados():
    assert filter_mock_pubs(MOCK_PUBS, None, None, None, None, None, "zzzquilombo") == []


def test_mock_q_combina_con_filtros():
    res = filter_mock_pubs(MOCK_PUBS, 1, 400000, None, None, None, "tulcan")
    assert all(p["estado"] == "ACTIVO" for p in res)
    assert all(p["canon_mensual"] >= 400000 for p in res)


# --- API (modo mock sin PG) ---
def test_api_q_devuelve_200_y_filtra():
    r = client.get("/api/publicaciones", params={"q": "habitacion"})
    assert r.status_code == 200
    pubs = _items(r.json())
    assert len(pubs) >= 1
    assert all(p["estado"] == "ACTIVO" for p in pubs)


def test_api_q_sin_resultados_vacio():
    r = client.get("/api/publicaciones", params={"q": "zzzquilombo"})
    assert r.status_code == 200
    assert _items(r.json()) == []


def test_api_q_un_caracter_422():
    r = client.get("/api/publicaciones", params={"q": "a"})
    assert r.status_code == 422


def test_api_q_combina_con_campus_y_precio():
    r = client.get("/api/publicaciones", params={"campus_id": 1, "precio_min": 400000, "q": "tulcan"})
    assert r.status_code == 200
    for p in _items(r.json()):
        assert p["estado"] == "ACTIVO"
        assert p["canon_mensual"] >= 400000


# --- Migración 003 alineada ---
def test_migracion_003_encadena_y_alinea_schema():
    mig = MIG_003.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "down_revision" in mig and "002_alineacion_indices" in mig
    for nombre in ("idx_publicaciones_fts", "idx_publicaciones_trgm", "pg_trgm"):
        assert nombre in mig, f"{nombre} falta en 003_busqueda_fts.py"
        assert nombre in schema, f"{nombre} falta en schema.sql"
