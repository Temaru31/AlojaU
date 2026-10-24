"""Task 4 (TDD) - Job vencimiento de destacados (spec 2026-10-14-publicidad §4).

Contrato:
  vencer_destacados(session) -> int: marca VENCIDO donde vence <= now()
    y estado en (PENDIENTE, ACTIVO). UPDATE, sin borrar historial.
  POST /api/admin/publicidad/vencer (ADMIN, patrón POST /evaluar).

Hermeticidad: mismo patrón que test_publicidad_api (vacía
publicacion_destacados + store mock antes/después; ids descubiertos).
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

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
    """Vacía publicacion_destacados (PG, best-effort) + store mock (best-effort)."""
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


def _plan_7d() -> dict:
    r = client.get("/api/publicidad/planes")
    assert r.status_code == 200, r.text
    return next(p for p in r.json() if p["dias"] == 7)


def _pub_activo_propia() -> int:
    r = client.get("/api/publicaciones/mias", params={"estado": "ACTIVO"}, headers=ARR)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert items, "el seed debe tener al menos 1 pub ACTIVO del dueño 1"
    return items[0]["id"]


def _forzar_vence_pasado(destacado_id: int) -> bool:
    """Pone vence en el pasado (PG). Retorna True si tocó PG."""
    async def _run():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute(
                "UPDATE publicacion_destacados SET inicia = now() - interval '2 days', "
                "vence = now() - interval '1 hour' WHERE id = $1;",
                destacado_id,
            )
        finally:
            await conn.close()
    try:
        asyncio.run(_run())
        return True
    except Exception:
        # Sin PG: mutar el store mock.
        try:
            from app.routers import publicidad as _pub
            d = next(x for x in _pub.MOCK_DESTACADOS if x["id"] == destacado_id)
            pasado = datetime.now(timezone.utc) - timedelta(hours=1)
            d["inicia"] = pasado - timedelta(days=1)
            d["vence"] = pasado
            return False
        except Exception:
            raise AssertionError("no se pudo forzar vence pasado (ni PG ni mock)")


def test_vencer_marca_vencido():
    """Step 1 brief: destacado con vence pasado -> tras job queda VENCIDO (historial intacto)."""
    from app.services import publicidad as svc  # existe el servicio (RED si no)
    assert callable(svc.vencer_destacados)

    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"], "pago_ref": "VENC-1"},
        headers={**ARR, "Idempotency-Key": "test-vencer-marca-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["estado"] == "PENDIENTE"
    _forzar_vence_pasado(d["id"])

    rv = client.post("/api/admin/publicidad/vencer", headers=ADMIN)
    assert rv.status_code == 200, rv.text
    assert rv.json()["vencidos"] >= 1

    # Historial preservado: sigue visible en mias, ahora VENCIDO.
    rm = client.get("/api/publicidad/mias", headers=ARR).json()
    rm = rm["items"] if isinstance(rm, dict) else rm
    por_id = {x["id"]: x["estado"] for x in rm}
    assert por_id.get(d["id"]) == "VENCIDO"

    # Idempotente: segunda corrida no re-vence nada.
    rv2 = client.post("/api/admin/publicidad/vencer", headers=ADMIN)
    assert rv2.status_code == 200, rv2.text
    assert rv2.json()["vencidos"] == 0


def test_vencer_activo_vencido_tambien():
    """Un ACTIVO con vence pasado también pasa a VENCIDO (no solo PENDIENTE)."""
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-vencer-activo-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    ra = client.patch(f"/api/admin/publicidad/{d['id']}", json={"accion": "aprobar"}, headers=ADMIN)
    assert ra.status_code == 200, ra.text
    assert ra.json()["estado"] == "ACTIVO"
    _forzar_vence_pasado(d["id"])

    rv = client.post("/api/admin/publicidad/vencer", headers=ADMIN)
    assert rv.status_code == 200, rv.text
    assert rv.json()["vencidos"] >= 1
    rm = client.get("/api/publicidad/mias", headers=ARR).json()
    rm = rm["items"] if isinstance(rm, dict) else rm
    assert {x["id"]: x["estado"] for x in rm}.get(d["id"]) == "VENCIDO"


def test_vencer_auth_y_sin_vencidos():
    """401 sin token, 403 arrendador; sin vencidos -> 0 (no 404/500)."""
    assert client.post("/api/admin/publicidad/vencer").status_code == 401
    assert client.post("/api/admin/publicidad/vencer", headers=ARR).status_code == 403
    rv = client.post("/api/admin/publicidad/vencer", headers=ADMIN)
    assert rv.status_code == 200, rv.text
    assert rv.json()["vencidos"] == 0
