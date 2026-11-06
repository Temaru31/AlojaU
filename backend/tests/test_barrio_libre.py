"""Tarea 3 (v10) — flexi-barrios: zona del catálogo o texto libre.

- GET /api/zonas -> 200 con las 6 zonas del seed.
- POST con barrio_texto (sin zona) -> 201 y zona_nombre == texto.
- POST sin zona ni barrio -> 422.
- POST con zona inexistente -> 404.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}

BASE = {
    "titulo": "Habitación barrio libre v10 xxxxxxxxxx",
    "descripcion": "Descripción con al menos veinte caracteres para pasar validación",
    "tipo_inmueble": "HABITACION_INDEPENDIENTE",
    "canon_mensual": 450000,
    "deposito_requerido": 0,
    "direccion_referencial": "Calle 5 # 4-70 referencia 10+",
    "reglas_convivencia": "No mascotas, visitas hasta 9pm, regla válida 10+",
    "latitud": 2.443,
    "longitud": -76.606,
    "servicios_ids": [1],
    "fotos": [
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
    ],
}


def test_zonas_200_con_seis():
    r = client.get("/api/zonas")
    assert r.status_code == 200
    nombres = {z["nombre"] for z in r.json()}
    assert {"Centro", "Tulcán", "Catay", "Alfonso López"} <= nombres
    assert len(r.json()) >= 6


def test_post_barrio_libre_201_y_se_muestra():
    payload = {**BASE, "barrio_texto": "Santa Inés"}
    r = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert r.status_code == 201, r.text
    pub_id = r.json()["id"]
    d = client.get(f"/api/publicaciones/{pub_id}", headers=ARR)
    assert d.status_code == 200
    body = d.json()
    assert body["zona_barrio_id"] is None
    assert body["barrio_texto"] == "Santa Inés"
    assert body["zona"] == "Santa Inés"
    assert body["zona_nombre"] == "Santa Inés"


def test_post_sin_zona_ni_barrio_422():
    r = client.post("/api/publicaciones", json=BASE, headers=ARR)
    assert r.status_code == 422


def test_post_zona_inexistente_404():
    payload = {**BASE, "zona_barrio_id": 999999}
    r = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert r.status_code == 404
