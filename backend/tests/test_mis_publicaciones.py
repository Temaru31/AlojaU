"""UX Mis publicaciones - GET /api/publicaciones/mias (dueño, todos los estados)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2


def test_mias_sin_token_401():
    r = client.get("/api/publicaciones/mias")
    assert r.status_code == 401


def test_mias_dueno_ve_suyas_incluido_pendiente():
    r = client.get("/api/publicaciones/mias", headers=ARR)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert all(p["usuario_id"] == 1 for p in items)
    # Incluye PENDIENTE (es su bandeja, no el catálogo público)
    assert any(p["estado"] == "PENDIENTE" for p in items)
    assert all("indice_confianza" in p and "fotos" in p for p in items)


def test_mias_otro_dueno_no_ve_ajenas():
    mias_arr = client.get("/api/publicaciones/mias", headers=ARR).json()
    mias_admin = client.get("/api/publicaciones/mias", headers=ADMIN).json()
    assert all(p["usuario_id"] == 2 for p in mias_admin)
    ids_arr = {p["id"] for p in mias_arr}
    ids_admin = {p["id"] for p in mias_admin}
    assert ids_arr.isdisjoint(ids_admin)


def test_mias_no_colisiona_con_detalle():
    # "mias" debe rutear al listado, no a /{pub_id} (declarada antes).
    r = client.get("/api/publicaciones/mias", headers=ARR)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
