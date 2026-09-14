"""Tarea 3 (v7) — campus_ids opcional al publicar + autovinculación 004.

- POST sin campus_ids -> 201 (antes 422 por min_length=1).
- Con coords, el trigger 004 + create_persisted vinculan TODOS los lugares
  activos con distancias Haversine (sin fricción en el formulario).
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}

BASE = {
    "titulo": "Habitación sin campus explícito, con mapa confirmado",
    "descripcion": "Descripción con al menos veinte caracteres para pasar validación",
    "tipo_inmueble": "HABITACION_INDEPENDIENTE",
    "canon_mensual": 500000,
    "deposito_requerido": 0,
    "zona_barrio_id": 3,
    "direccion_referencial": "Calle 5 # 4-70 Tulcán referencia 10+",
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


def _n_lugares() -> int:
    return len(client.get("/api/campus").json())


def test_post_sin_campus_ids_201():
    payload = {**BASE, "titulo": "Aviso v7 sin campus " + "x" * 10}
    r = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert r.status_code == 201, r.text
    assert r.json()["estado"] == "PENDIENTE"


def test_post_sin_campus_autovincula_todos_lugares():
    payload = {**BASE, "titulo": "Aviso v7 autovinculado " + "y" * 10}
    pub_id = client.post("/api/publicaciones", json=payload, headers=ARR).json()["id"]
    n = _n_lugares()
    assert n >= 7
    # El detalle resuelve distancia contra cualquier lugar (trigger 004).
    for lugar_id in (1, 3, 7):
        d = client.get(f"/api/publicaciones/{pub_id}", params={"campus_id": lugar_id}, headers=ARR)
        assert d.status_code == 200, d.text
        ref = d.json().get("campus_ref")
        assert ref and ref["campus_id"] == lugar_id and ref["dist_m"] is not None


def test_post_campus_invalido_sigue_404():
    payload = {**BASE, "titulo": "Aviso v7 campus malo " + "z" * 10, "campus_ids": [999999]}
    r = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert r.status_code == 404
