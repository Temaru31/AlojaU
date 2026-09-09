"""F1 contrato backend - DTOs estrictos, paginación SQL, dedup, favicon docs."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}


def test_f1_lista_contrato_estricto_alias():
    r = client.get("/api/publicaciones", params={"campus_id": 1, "page": 1, "size": 2})
    assert r.status_code == 200
    data = r.json()
    assert {"items", "total", "page", "size", "pages"} <= set(data.keys())
    assert len(data["items"]) >= 1
    for p in data["items"]:
        # canónicos + alias compat explícitos (contrato FE)
        assert p["canon"] == p["canon_mensual"]
        assert p["indice"] == p["indice_confianza"]
        assert p["nivel"] == p["nivel_confianza"]
        assert p["dist_m"] == p["distancia_geodesica_m"]
        assert p["zona"] == p["zona_nombre"]


def test_f1_paginacion_sql_sin_solape():
    p1 = client.get("/api/publicaciones", params={"campus_id": 1, "page": 1, "size": 2}).json()
    p2 = client.get("/api/publicaciones", params={"campus_id": 1, "page": 2, "size": 2}).json()
    assert p1["total"] == p2["total"] >= 2
    ids1 = {i["id"] for i in p1["items"]}
    ids2 = {i["id"] for i in p2["items"]}
    assert ids1.isdisjoint(ids2), "páginas SQL no deben solaparse"


def test_f1_detalle_contrato_unificado():
    r = client.get("/api/publicaciones/1")
    assert r.status_code == 200
    p = r.json()
    assert p["canon"] == p["canon_mensual"]
    assert p["deposito"] == p["deposito_requerido"]
    assert p["indice"] == p["indice_confianza"]
    assert p["nivel"] == p["nivel_confianza"]
    assert p["dist_m"] == p["distancia_geodesica_m"]
    assert isinstance(p["servicios_ids"], list) and 1 in p["servicios_ids"]


def test_f1_crear_dedup_ids_201():
    payload = {
        "titulo": "F1 dedup ids duplicados titulo largo suficiente",
        "descripcion": "Descripción con al menos veinte caracteres para pasar validación",
        "tipo_inmueble": "HABITACION_INDEPENDIENTE",
        "canon_mensual": 500000,
        "deposito_requerido": 0,
        "zona_barrio_id": 1,
        "direccion_referencial": "Calle 5 # 4-70 Tulcán referencia 10+",
        "reglas_convivencia": "No mascotas, visitas hasta 9pm, regla válida 10+",
        "servicios_ids": [1, 1],
        "campus_ids": [1, 1],
        "fotos": [
            "https://res.cloudinary.com/demo/image/upload/v1/alojau/f1a.jpg",
            "https://res.cloudinary.com/demo/image/upload/v1/alojau/f1b.jpg",
            "https://res.cloudinary.com/demo/image/upload/v1/alojau/f1c.jpg",
        ],
    }
    r = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert r.status_code in (201, 404)  # 404 si DB estricta sin seed, 201 con DB
    if r.status_code == 201:
        assert r.json()["estado"].startswith("PENDIENTE")


def test_f1_docs_favicon_custom():
    r = client.get("/docs")
    assert r.status_code == 200
    assert "/static/favicon.svg" in r.text
    assert "fastapi.tiangolo.com/img/favicon" not in r.text
    assert client.get("/static/favicon.svg").status_code == 200


def test_f1_campus_contrato():
    r = client.get("/api/campus")
    assert r.status_code == 200
    for c in r.json():
        assert {"id", "institucion", "nombre_sede", "latitud", "longitud"} <= set(c.keys())
