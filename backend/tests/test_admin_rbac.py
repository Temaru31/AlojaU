"""RBAC admin - métricas, pendientes, aprobar/rechazar/eliminar (solo ADMIN).

Mutaciones contra MOCK forzado (sesión muerta) para no ensuciar la PG dev;
las que tocan el mock global se restauran (id 3 vuelve a PENDIENTE).
"""
from contextlib import contextmanager

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import get_session

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1, ARRENDADOR
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2, ADMIN


class _DeadSession:
    async def get(self, *a, **k):
        raise RuntimeError("PG caído (test)")

    async def execute(self, *a, **k):
        raise RuntimeError("PG caído (test)")

    async def commit(self):
        raise RuntimeError("PG caído (test)")

    async def rollback(self):
        return None


async def _dead_session():
    yield _DeadSession()


@contextmanager
def mock_forzado():
    app.dependency_overrides[get_session] = _dead_session
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_session, None)


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
    with mock_forzado():
        r = client.patch("/api/admin/publicaciones/3", json={"estado": "ACTIVO"}, headers=ADMIN)
        assert r.status_code == 200
        assert r.json()["estado"] == "ACTIVO"
        # Restaura el mock (id 3 es PENDIENTE en MOCK_PUBS).
        rb = client.patch("/api/admin/publicaciones/3", json={"estado": "RECHAZADO"}, headers=ADMIN)
        assert rb.status_code == 200
        rc = client.patch("/api/admin/publicaciones/3", json={"estado": "PAUSADO"}, headers=ADMIN)
        assert rc.status_code == 200
        # Vuelve a PENDIENTE directo en memoria (no hay endpoint; es dato mock).
        from app.routers.publicaciones import MOCK_PUBS

        next(p for p in MOCK_PUBS if p["id"] == 3)["estado"] = "PENDIENTE"


def test_admin_estado_invalido_422_y_404():
    with mock_forzado():
        assert client.patch("/api/admin/publicaciones/3", json={"estado": "BORRADO"}, headers=ADMIN).status_code == 422
        assert client.patch("/api/admin/publicaciones/999999", json={"estado": "ACTIVO"}, headers=ADMIN).status_code == 404


def test_admin_delete_crea_y_borra_sin_rastro():
    with mock_forzado():
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
