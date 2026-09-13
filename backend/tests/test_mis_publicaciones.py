"""UX Mis publicaciones - GET /api/publicaciones/mias (dueño, paginado) + PATCH editar.

Estrategia anti-fragilidad (la suite corre con o sin PG local):
- Tests "tolerantes": valen en ruta DB y en mock (solo exigen lo común).
- Tests "mock forzado": sesión muerta vía dependency_overrides -> garantiza la
  rama mock (PENDIENTE incluido, 403 no-dueño) aunque haya PG arriba.
"""
from contextlib import contextmanager

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import get_session

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2


class _DeadSession:
    """Simula PG caído: todo raise salvo rollback (ejercita el fallback mock)."""

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


def test_mias_sin_token_401():
    r = client.get("/api/publicaciones/mias")
    assert r.status_code == 401


def test_mias_dueno_ve_suyas_paginado():
    r = client.get("/api/publicaciones/mias", params={"size": 5}, headers=ARR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    assert all(p["usuario_id"] == 1 for p in data["items"])
    assert all("indice_confianza" in p and "fotos" in p for p in data["items"])


def test_mias_filtro_estado_invalido_422():
    r = client.get("/api/publicaciones/mias", params={"estado": "NOEXISTE"}, headers=ARR)
    assert r.status_code == 422


def test_mias_mock_incluye_pendiente_y_no_colisiona():
    with mock_forzado():
        r = client.get("/api/publicaciones/mias", headers=ARR)
        assert r.status_code == 200
        data = r.json()
        # mock: id 1 ACTIVO + id 3 PENDIENTE del dueño 1
        assert any(p["estado"] == "PENDIENTE" for p in data["items"])
        assert "items" in data and "total" in data and "pages" in data


def test_mias_otro_dueno_no_ve_ajenas():
    with mock_forzado():
        mias_arr = client.get("/api/publicaciones/mias", headers=ARR).json()["items"]
        mias_admin = client.get("/api/publicaciones/mias", headers=ADMIN).json()["items"]
        assert all(p["usuario_id"] == 2 for p in mias_admin)
        ids_arr = {p["id"] for p in mias_arr}
        ids_admin = {p["id"] for p in mias_admin}
        assert ids_arr.isdisjoint(ids_admin)


def test_patch_sin_token_401():
    r = client.patch("/api/publicaciones/1", json={"titulo": "Nuevo título válido aquí"})
    assert r.status_code == 401


def test_patch_no_dueno_403():
    # mock: id 2 es del usuario 2 -> arrendador (id 1) recibe 403.
    with mock_forzado():
        r = client.patch("/api/publicaciones/2", json={"titulo": "Intento ajeno válido aquí"}, headers=ARR)
        assert r.status_code == 403


def test_patch_inexistente_404():
    r = client.patch("/api/publicaciones/999999", json={"titulo": "Título válido cualquiera"}, headers=ADMIN)
    assert r.status_code == 404


def test_patch_body_vacio_y_cotas_422():
    with mock_forzado():
        r = client.patch("/api/publicaciones/2", json={}, headers=ADMIN)
        assert r.status_code == 422
        r2 = client.patch("/api/publicaciones/2", json={"titulo": "corto"}, headers=ADMIN)
        assert r2.status_code == 422


def test_patch_dueno_edita_ok():
    # Lee el título real primero (seed DB y mock difieren) para restaurarlo igual.
    original = client.get("/api/publicaciones/1", headers=ARR).json()["titulo"]
    nuevo = "Habitación editada por dueño válida"
    r = client.patch("/api/publicaciones/1", json={"titulo": nuevo}, headers=ARR)
    assert r.status_code == 200
    assert r.json()["titulo"] == nuevo
    assert r.json()["usuario_id"] == 1
    # Restaura para no ensuciar demos ni otros tests.
    r2 = client.patch("/api/publicaciones/1", json={"titulo": original}, headers=ARR)
    assert r2.status_code == 200
    assert r2.json()["titulo"] == original
