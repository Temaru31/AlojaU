"""T1 reportes - POST anónimo 201, anti-spam 429, admin 401/403, flujo PENDIENTE->revisado."""
from fastapi.testclient import TestClient
from app.main import app
from app.routers import reportes as reportes_mod

client = TestClient(app)

ADMIN = {"Authorization": "Bearer mock-token-admin"}
ARREND = {"Authorization": "Bearer mock-token-arrendador"}
PAYLOAD = {"publicacion_id": 1, "motivo": "DATOS_FALSOS", "detalle": "foto no coincide"}


def _reset_quota():
    reportes_mod._REPORT_ATTEMPTS.clear()


def test_t1_crear_anonimo_201():
    _reset_quota()
    r = client.post("/api/reportes", json=PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["estado"] == "PENDIENTE"
    assert data["publicacion_id"] == 1
    assert data["motivo"] == "DATOS_FALSOS"
    assert data["usuario_id"] is None


def test_t1_crear_autenticado_registra_dueno():
    _reset_quota()
    r = client.post("/api/reportes", json=PAYLOAD, headers=ARREND)
    assert r.status_code == 201
    assert r.json()["usuario_id"] == 1


def test_t1_crear_pub_inexistente_404():
    _reset_quota()
    r = client.post("/api/reportes", json={**PAYLOAD, "publicacion_id": 999999})
    assert r.status_code == 404


def test_t1_crear_motivo_invalido_422():
    _reset_quota()
    r = client.post("/api/reportes", json={**PAYLOAD, "motivo": "NO_EXISTE"})
    assert r.status_code == 422


def test_t1_bandeja_sin_token_401():
    r = client.get("/api/reportes")
    assert r.status_code == 401


def test_t1_bandeja_no_admin_403():
    r = client.get("/api/reportes", headers=ARREND)
    assert r.status_code == 403


def test_t1_bandeja_admin_200_y_filtro():
    _reset_quota()
    client.post("/api/reportes", json=PAYLOAD)
    r = client.get("/api/reportes", headers=ADMIN)
    assert r.status_code == 200
    assert any(x["estado"] == "PENDIENTE" for x in r.json())
    r2 = client.get("/api/reportes", params={"estado": "PENDIENTE"}, headers=ADMIN)
    assert r2.status_code == 200
    assert all(x["estado"] == "PENDIENTE" for x in r2.json())


def test_t1_patch_no_admin_403():
    r = client.patch("/api/reportes/1", json={"accion": "descartar"}, headers=ARREND)
    assert r.status_code == 403


def test_t1_patch_inexistente_404():
    r = client.patch("/api/reportes/999999", json={"accion": "descartar"}, headers=ADMIN)
    assert r.status_code == 404


def test_t1_flujo_confirmar_y_descartar():
    _reset_quota()
    id1 = client.post("/api/reportes", json=PAYLOAD).json()["id"]
    id2 = client.post("/api/reportes", json={**PAYLOAD, "motivo": "OTRO"}).json()["id"]
    rc = client.patch(f"/api/reportes/{id1}", json={"accion": "confirmar"}, headers=ADMIN)
    assert rc.status_code == 200
    assert rc.json()["estado"] == "CONFIRMADO"
    rd = client.patch(f"/api/reportes/{id2}", json={"accion": "descartar"}, headers=ADMIN)
    assert rd.status_code == 200
    assert rd.json()["estado"] == "DESCARTADO"
    rr = client.patch(f"/api/reportes/{id1}", json={"accion": "descartar"}, headers=ADMIN)
    assert rr.status_code == 409


def test_t1_antispam_429():
    _reset_quota()
    codes = [client.post("/api/reportes", json=PAYLOAD).status_code for _ in range(6)]
    assert codes[-1] == 429
    assert codes[0] == 201
