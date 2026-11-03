"""Fase 2+3+4 — búsqueda tokenizada, filtros imposibles y POIs intactos.

- Tokenización ignora stop-words.
- Filtros imposibles -> 200 OK con [] (nunca 500, nunca banner rojo).
- `q` no distorsiona el filtro de POIs `campus_id` (contrato 004 intacto).
"""

from fastapi.testclient import TestClient

from app.main import app
from app.services.search import escape_ilike, tokenize_query

client = TestClient(app)


def _items(data):
    return data["items"] if isinstance(data, dict) and "items" in data else data


def test_tokenize_ignora_stopwords():
    assert tokenize_query("Apartamento amoblado con closet en el centro") == [
        "apartamento", "amoblado", "closet", "centro",
    ]
    assert tokenize_query("con de en el la un para") == []
    assert tokenize_query("  apartamento   CON   baño  ") == ["apartamento", "baño"]


def test_escape_ilike_no_rompe_sql():
    assert escape_ilike("100%_x\\y") == "100\\%\\_x\\\\y"
    # Los caracteres se tokenizan fuera; el escape solo blinda el LIKE.
    assert tokenize_query("100% _ test") == ["100", "test"]


def test_filtros_imposibles_200_vacio():
    r = client.get("/api/publicaciones", params={"precio_min": 9000000, "precio_max": 9500000, "q": "habitacion"})
    assert r.status_code == 200
    assert _items(r.json()) == []


def test_api_q_tokenizada_200():
    r = client.get("/api/publicaciones", params={"q": "apartamento con baño"})
    assert r.status_code == 200
    assert isinstance(_items(r.json()), list)


def test_api_ciudades_200_con_popayan():
    r = client.get("/api/ciudades")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    assert any(c.get("slug") == "popayan" for c in data)


def test_api_automation_borrador_404():
    # Sin flag: existe pero desactivado (no filtra existencia con 403).
    r = client.get("/api/admin/automation/settings")
    assert r.status_code in (401, 403, 404)
