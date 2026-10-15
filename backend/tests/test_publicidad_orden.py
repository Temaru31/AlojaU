"""Task 3 (TDD) - Destacados primero en búsqueda + flag en lista y detalle.

Contrato (brief task-3 + spec §4):
  Vigente = PublicacionDestacado estado ACTIVO AND vence > now().
  GET /api/publicaciones: vigentes primero (prioridad desc), resto con el
    orden actual intacto. Items con `destacado: bool` y `destacado_vence`.
  GET /api/publicaciones/{id}: mismo flag.

Hermeticidad: mismo patrón que test_publicidad_api (vacía
publicacion_destacados + store mock antes/después; ids descubiertos).
"""
import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2


def _dsn() -> str:
    from app.db.session import dsn_asyncpg_a_psycopg
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    return dsn_asyncpg_a_psycopg(raw)


def _limpiar_destacados():
    async def _run():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute("TRUNCATE publicacion_destacados RESTART IDENTITY;")
        finally:
            await conn.close()
    try:
        asyncio.run(_run())
    except Exception:
        pass
    try:
        from app.routers import publicidad as _pub
        _pub.clear_publicidad_mock_for_tests()
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _destacados_hermeticos():
    _limpiar_destacados()
    yield
    _limpiar_destacados()


def _planes() -> dict:
    r = client.get("/api/publicidad/planes")
    assert r.status_code == 200, r.text
    return {p["dias"]: p for p in r.json()}


def _dos_activas_propias() -> tuple[int, int]:
    r = client.get("/api/publicaciones/mias", params={"estado": "ACTIVO"}, headers=ARR)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 2, "el seed debe tener >=2 pubs ACTIVO del dueño 1"
    return items[0]["id"], items[1]["id"]


def _destacar_y_aprobar(pub_id: int, plan_id: int, clave: str) -> dict:
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan_id},
        headers={**ARR, "Idempotency-Key": clave},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    ra = client.patch(
        f"/api/admin/publicidad/{d['id']}", json={"accion": "aprobar"}, headers=ADMIN
    )
    assert ra.status_code == 200, ra.text
    assert ra.json()["estado"] == "ACTIVO"
    return ra.json()


def _lista(size: int = 50) -> list:
    r = client.get("/api/publicaciones", params={"size": size})
    assert r.status_code == 200, r.text
    data = r.json()
    return data["items"] if isinstance(data, dict) else data


def test_busqueda_ordena_destacados_primero():
    """Step 1 brief: 2 pubs, una destacada ACTIVO -> primera + destacado=true."""
    planes = _planes()
    pub_a, pub_b = _dos_activas_propias()
    _destacar_y_aprobar(pub_a, planes[7]["id"], "t3-ordena-primero-01")

    items = _lista()
    pos = {p["id"]: i for i, p in enumerate(items)}
    assert pub_a in pos and pub_b in pos
    assert pos[pub_a] < pos[pub_b], "la destacada debe ir antes que la no destacada"

    card_a = items[pos[pub_a]]
    assert card_a["destacado"] is True
    assert card_a["destacado_vence"] is not None
    card_b = items[pos[pub_b]]
    assert card_b["destacado"] is False
    assert card_b["destacado_vence"] is None

    det_a = client.get(f"/api/publicaciones/{pub_a}")
    assert det_a.status_code == 200, det_a.text
    assert det_a.json()["destacado"] is True
    assert det_a.json()["destacado_vence"] is not None
    det_b = client.get(f"/api/publicaciones/{pub_b}")
    assert det_b.status_code == 200, det_b.text
    assert det_b.json()["destacado"] is False
    assert det_b.json()["destacado_vence"] is None


def test_busqueda_ordena_por_prioridad_desc():
    """Dos vigentes: la de plan 30d (prio 3) va antes que la de 7d (prio 1)."""
    planes = _planes()
    pub_a, pub_b = _dos_activas_propias()
    _destacar_y_aprobar(pub_a, planes[7]["id"], "t3-prioridad-a-01")
    _destacar_y_aprobar(pub_b, planes[30]["id"], "t3-prioridad-b-01")

    items = _lista()
    pos = {p["id"]: i for i, p in enumerate(items)}
    assert pos[pub_b] < pos[pub_a], "mayor prioridad primero"
    assert items[pos[pub_a]]["destacado"] is True
    assert items[pos[pub_b]]["destacado"] is True


def test_destacado_vencido_no_destaca():
    """ACTIVO pero vence pasado -> sin badge y sin salto de orden."""
    planes = _planes()
    pub_a, pub_b = _dos_activas_propias()
    d = _destacar_y_aprobar(pub_a, planes[7]["id"], "t3-vencido-01")

    async def _vencer():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute(
                "UPDATE publicacion_destacados SET inicia = NOW() - INTERVAL '2 days', vence = NOW() - INTERVAL '1 day' WHERE id = $1",
                d["id"],
            )
        finally:
            await conn.close()
    try:
        asyncio.run(_vencer())
    except Exception as e:
        pytest.skip(f"sin PG para simular vencimiento: {e}")

    items = _lista()
    card_a = next(p for p in items if p["id"] == pub_a)
    assert card_a["destacado"] is False
    assert card_a["destacado_vence"] is None
    det_a = client.get(f"/api/publicaciones/{pub_a}")
    assert det_a.status_code == 200, det_a.text
    assert det_a.json()["destacado"] is False
