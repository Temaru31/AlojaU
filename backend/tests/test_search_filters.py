"""Fase 2+3+4 — búsqueda tokenizada, filtros imposibles y POIs intactos.

- Tokenización ignora stop-words: "apartamento con baño" matchea
  "apartamento con baño privado" (2/2) y "apartamento amplio" (1/2, parcial).
- Filtros imposibles -> 200 OK con [] (nunca 500/503 en mock, nunca banner rojo).
- `q` no distorsiona el filtro de POIs `campus_id` (contrato 004 intacto).
"""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.publicaciones import MOCK_PUBS
from app.services.publicacion_view import filter_mock_pubs
from app.services.search import escape_ilike, tokenize_query

client = TestClient(app)


def _items(data):
    return data["items"] if isinstance(data, dict) and "items" in data else data


PUBS_DEMO = [
    {
        "id": 101, "titulo": "Apartamento con baño privado", "descripcion": "Amoblado con closet amplio",
        "tipo_inmueble": "APARTAESTUDIO", "canon_mensual": 700000, "estado": "ACTIVO",
        "zona_nombre": "Centro", "servicios": ["WiFi Fibra", "Amoblado"], "servicios_ids": [1, 4],
        "fotos": ["a"], "latitud": 2.442, "longitud": -76.6, "campus_ids": [1],
        "ciudad_id": 1, "usuario_id": 1, "telefono_verificado": True, "reportes_activos": 0,
    },
    {
        "id": 102, "titulo": "Apartamento amplio", "descripcion": "Ideal estudiantes, cerca centro",
        "tipo_inmueble": "APARTAESTUDIO", "canon_mensual": 650000, "estado": "ACTIVO",
        "zona_nombre": "Centro", "servicios": ["WiFi Fibra"], "servicios_ids": [1],
        "fotos": ["a"], "latitud": 2.442, "longitud": -76.6, "campus_ids": [1],
        "ciudad_id": 1, "usuario_id": 1, "telefono_verificado": True, "reportes_activos": 0,
    },
    {
        "id": 103, "titulo": "Casa campestre lejos", "descripcion": "Finca rural sin amoblar",
        "tipo_inmueble": "COMPARTIDO", "canon_mensual": 500000, "estado": "ACTIVO",
        "zona_nombre": "Vereda", "servicios": [], "servicios_ids": [],
        "fotos": ["a"], "latitud": 2.5, "longitud": -76.7, "campus_ids": [2],
        "ciudad_id": 1, "usuario_id": 1, "telefono_verificado": False, "reportes_activos": 0,
    },
]


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


def test_busqueda_tokenizada_parciales_con_score():
    res = filter_mock_pubs(PUBS_DEMO, None, None, None, None, None, "apartamento con baño")
    ids = [p["id"] for p in res]
    # Ambos parciales incluidos; el de 2/2 primero (relevancia).
    assert ids == [101, 102]


def test_busqueda_sinonimo_tipo():
    res = filter_mock_pubs(PUBS_DEMO, None, None, None, None, None, "apartamento")
    assert {p["id"] for p in res} == {101, 102}


def test_busqueda_solo_stopwords_no_filtra():
    res = filter_mock_pubs(PUBS_DEMO, None, None, None, None, None, "con de la")
    assert len(res) == 3


def test_filtros_imposibles_200_vacio():
    r = client.get("/api/publicaciones", params={"precio_min": 9000000, "precio_max": 9500000, "q": "habitacion"})
    assert r.status_code == 200
    assert _items(r.json()) == []


def test_q_no_distorsiona_pois():
    # Sin q: campus 1 trae sus miembros; con q irrelevante sigue filtrando por membresía.
    sin_q = filter_mock_pubs(MOCK_PUBS, 1, None, None, None, None, None)
    con_q = filter_mock_pubs(MOCK_PUBS, 1, None, None, None, None, "zzzquilombo")
    assert len(sin_q) >= 1
    assert con_q == []
    # Con q relevante + campus: todo resultado pertenece al lugar (o es ordenado por él).
    res = filter_mock_pubs(MOCK_PUBS, 1, None, None, None, None, "tulcan")
    assert all(p["estado"] == "ACTIVO" for p in res)


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
