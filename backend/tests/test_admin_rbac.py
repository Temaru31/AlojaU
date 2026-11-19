"""RBAC admin - métricas, pendientes, aprobar/rechazar/eliminar (solo ADMIN).

Corre contra PG; conftest restaura el seed antes de cada test.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1, ARRENDADOR
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2, ADMIN


def test_admin_metricas_401_403_200():
    assert client.get("/api/admin/metricas").status_code == 401
    assert client.get("/api/admin/metricas", headers=ARR).status_code == 403
    r = client.get("/api/admin/metricas", headers=ADMIN)
    assert r.status_code == 200
    data = r.json()
    for k in ("total_publicaciones", "activas", "pendientes", "reportes_activos",
              "arrendadores_verificados", "total_usuarios"):
        assert k in data and isinstance(data[k], int)


def test_admin_pendientes_403_y_paginado():
    assert client.get("/api/admin/pendientes", headers=ARR).status_code == 403
    r = client.get("/api/admin/pendientes", headers=ADMIN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data
    assert all(p["estado"] == "PENDIENTE" for p in data["items"])


def test_admin_aprobar_y_restaurar():
    r = client.patch("/api/admin/publicaciones/3", json={"estado": "ACTIVO"}, headers=ADMIN)
    assert r.status_code == 200
    assert r.json()["estado"] == "ACTIVO"
    rb = client.patch("/api/admin/publicaciones/3", json={"estado": "RECHAZADO"}, headers=ADMIN)
    assert rb.status_code == 200
    rc = client.patch("/api/admin/publicaciones/3", json={"estado": "PAUSADO"}, headers=ADMIN)
    assert rc.status_code == 200


def test_admin_estado_invalido_422_y_404():
    assert client.patch("/api/admin/publicaciones/3", json={"estado": "BORRADO"}, headers=ADMIN).status_code == 422
    assert client.patch("/api/admin/publicaciones/999999", json={"estado": "ACTIVO"}, headers=ADMIN).status_code == 404


def test_admin_delete_crea_y_borra_sin_rastro():
    payload = {
        "titulo": "Temporal para borrar admin",
        "descripcion": "Descripción con más de veinte caracteres",
        "tipo_inmueble": "APARTAESTUDIO",
        "canon_mensual": 500000,
        "deposito_requerido": 0,
        "zona_barrio_id": 1,
        "direccion_referencial": "Calle 1 # 1-01 demo",
        "reglas_convivencia": "Reglas de convivencia demo",
        "servicios_ids": [1],
        "campus_ids": [1],
        "fotos": ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"],
    }
    rc = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert rc.status_code == 201
    pid = rc.json()["id"]
    # No-dueño no puede (403 en admin router aunque sea dueño: solo ADMIN).
    assert client.delete(f"/api/admin/publicaciones/{pid}", headers=ARR).status_code == 403
    assert client.delete(f"/api/admin/publicaciones/{pid}").status_code == 401
    rd = client.delete(f"/api/admin/publicaciones/{pid}", headers=ADMIN)
    assert rd.status_code == 204
    assert client.delete(f"/api/admin/publicaciones/{pid}", headers=ADMIN).status_code == 404
