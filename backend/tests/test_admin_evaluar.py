"""POST /api/admin/automation/evaluar/{pub_id} — pausa automática por reportes.

Requiere PG (el endpoint no tiene fallback mock: sin DB responde 503, igual que
POST /api/reportes). Cubre umbral, pausa ACTIVO con >=3 reportes, idempotencia,
401/403/404. Pub 1 del seed no trae reportes (n=0 determinista tras reseed).
"""
from fastapi.testclient import TestClient

from app.main import app
from app.routers import reportes as reportes_mod

client = TestClient(app)
ADMIN = {"Authorization": "Bearer mock-token-admin"}
ARREND = {"Authorization": "Bearer mock-token-arrendador"}


def _reset_quota():
    reportes_mod._REPORT_ATTEMPTS.clear()


def _reportar(pub_id=1):
    _reset_quota()
    r = client.post(
        "/api/reportes",
        json={"publicacion_id": pub_id, "motivo": "DATOS_FALSOS", "detalle": "spam?"},
    )
    assert r.status_code == 201, r.text


def test_evaluar_rbac():
    assert client.post("/api/admin/automation/evaluar/1").status_code == 401
    assert client.post("/api/admin/automation/evaluar/1", headers=ARREND).status_code == 403


def test_evaluar_pub_inexistente_404():
    r = client.post("/api/admin/automation/evaluar/999999", headers=ADMIN)
    assert r.status_code == 404


def test_evaluar_sin_reportes_no_pausa():
    r = client.post("/api/admin/automation/evaluar/1", headers=ADMIN)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == 1 and data["evaluado"] is True
    assert data["pausado"] is False
    assert data["reportes"] == 0 and data["umbral"] == 3


def test_evaluar_pausa_con_umbral_y_catalogo():
    for _ in range(3):
        _reportar(1)
    r = client.post("/api/admin/automation/evaluar/1", headers=ADMIN)
    assert r.status_code == 200
    data = r.json()
    assert data["pausado"] is True and data["reportes"] >= 3
    # Segunda evaluación: ya no está ACTIVO -> idempotente, no vuelve a pausar.
    r2 = client.post("/api/admin/automation/evaluar/1", headers=ADMIN)
    assert r2.json()["pausado"] is False
    # Fuera del catálogo público (solo ACTIVO).
    cat = client.get("/api/publicaciones", params={"campus_id": 1}).json()
    items = cat["items"] if isinstance(cat, dict) else cat
    assert 1 not in [p["id"] for p in items]


def test_evaluar_ya_pausado_no_repite():
    # Pub 14 del seed: PAUSADO_POR_REPORTE con 3 CONFIRMADO -> nada que hacer.
    r = client.post("/api/admin/automation/evaluar/14", headers=ADMIN)
    assert r.status_code == 200
    assert r.json()["pausado"] is False
