"""Task 2 (TDD) - Router publicidad + registro.

Contrato (spec 2026-10-14-publicidad §4):
  GET   /api/publicidad/planes              público, 3 planes 7/15/30d
  POST  /api/publicidad/destacar            ARRENDADOR dueño, Idempotency-Key -> 201 PENDIENTE
  GET   /api/publicidad/mias                dueño: historial y estado
  GET   /api/admin/publicidad/pendientes    ADMIN
  PATCH /api/admin/publicidad/{id}          ADMIN aprobar->ACTIVO / rechazar->RECHAZADO (+audit)

Anti-fragilidad: los tests descubren ids (plan 7d, pub ACTIVO propia) en vez
de hardcodearlos, así valen en ruta DB (seed 16 pubs) y en mock.
Hermeticidad: publicacion_destacados NO está en el TRUNCATE de seed.sql, así
que cada test la vacía antes (si hay PG) + limpia el store mock.
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
    planes = r.json()
    plan = next(p for p in planes if p["dias"] == 7)
    return plan


def _pub_activo_propia() -> int:
    r = client.get("/api/publicaciones/mias", params={"estado": "ACTIVO"}, headers=ARR)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert items, "el seed debe tener al menos 1 pub ACTIVO del dueño 1"
    return items[0]["id"]


def _pub_no_activo_propia() -> int:
    r = client.get("/api/publicaciones/mias", headers=ARR)
    assert r.status_code == 200, r.text
    otros = [p for p in r.json()["items"] if p["estado"] != "ACTIVO"]
    assert otros, "el seed debe tener al menos 1 pub no-ACTIVO del dueño 1"
    return otros[0]["id"]


def _pub_activo_ajena() -> int:
    r = client.get("/api/publicaciones", params={"size": 50})
    assert r.status_code == 200, r.text
    data = r.json()
    items = data["items"] if isinstance(data, dict) else data
    ajenas = [p for p in items if p["estado"] == "ACTIVO" and p["usuario_id"] != 1]
    assert ajenas, "el seed debe tener al menos 1 pub ACTIVO de otro dueño"
    return ajenas[0]["id"]


def test_planes_publico_sin_token():
    r = client.get("/api/publicidad/planes")
    assert r.status_code == 200
    planes = r.json()
    assert isinstance(planes, list) and len(planes) >= 3
    por_dias = {p["dias"]: p for p in planes}
    assert set((7, 15, 30)) <= set(por_dias)
    assert por_dias[7]["precio_cop"] == 15000
    assert all(p["activo"] for p in (por_dias[7], por_dias[15], por_dias[30]))


def test_destacar_crea_pendiente():
    """Step 1 brief: POST con pub ACTIVO propia + plan 7d + Idempotency-Key -> 201 PENDIENTE."""
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"], "pago_ref": "NEQUI-123"},
        headers={**ARR, "Idempotency-Key": "test-destacar-pendiente-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["publicacion_id"] == pub_id
    assert d["plan_id"] == plan["id"]
    assert d["estado"] == "PENDIENTE"
    assert d["pago_ref"] == "NEQUI-123"
    inicia = datetime.fromisoformat(d["inicia"])
    vence = datetime.fromisoformat(d["vence"])
    delta_s = (vence - inicia).total_seconds()
    assert abs(delta_s - 7 * 86400) < 120, delta_s
    # Replay idempotente: misma clave -> mismo id, sin duplicar.
    r2 = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"], "pago_ref": "NEQUI-123"},
        headers={**ARR, "Idempotency-Key": "test-destacar-pendiente-01"},
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] == d["id"]


def test_destacar_duplicado_vigente_409():
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r1 = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-duplicado-A"},
    )
    assert r1.status_code == 201, r1.text
    r2 = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-duplicado-B"},
    )
    assert r2.status_code == 409, r2.text


def test_destacar_no_activo_409():
    plan = _plan_7d()
    pub_id = _pub_no_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-noactivo-01"},
    )
    assert r.status_code == 409, r.text


def test_destacar_no_dueno_403():
    plan = _plan_7d()
    pub_id = _pub_activo_ajena()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-nodueno-01"},
    )
    assert r.status_code == 403, r.text


def test_destacar_sin_token_401():
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
    )
    assert r.status_code in (401, 403), r.text


def test_mias_historial_dueno():
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-mias-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    r2 = client.get("/api/publicidad/mias", headers=ARR)
    assert r2.status_code == 200, r2.text
    items = r2.json()
    items = items["items"] if isinstance(items, dict) else items
    assert any(x["id"] == d["id"] and x["estado"] == "PENDIENTE" for x in items)
    r3 = client.get("/api/publicidad/mias")
    assert r3.status_code in (401, 403), r3.text


def test_mock_sin_pg_flujo_basico():
    """Rama mock (PG caído, solo dev): planes + destacar + replay + 409."""
    from app.db.session import get_session

    class _DeadSession:
        async def get(self, *a, **k):
            raise RuntimeError("PG caído (test)")

        async def execute(self, *a, **k):
            raise RuntimeError("PG caído (test)")

        async def commit(self):
            raise RuntimeError("PG caído (test)")

        async def refresh(self, *a, **k):
            raise RuntimeError("PG caído (test)")

        async def rollback(self):
            return None

    async def _dead():
        yield _DeadSession()

    app.dependency_overrides[get_session] = _dead
    try:
        rp = client.get("/api/publicidad/planes")
        assert rp.status_code == 200, rp.text
        assert len(rp.json()) >= 3
        r1 = client.post(
            "/api/publicidad/destacar",
            json={"publicacion_id": 1, "plan_id": 1},
            headers={**ARR, "Idempotency-Key": "test-destacar-mock-01"},
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["estado"] == "PENDIENTE"
        r2 = client.post(
            "/api/publicidad/destacar",
            json={"publicacion_id": 1, "plan_id": 1},
            headers={**ARR, "Idempotency-Key": "test-destacar-mock-01"},
        )
        assert r2.status_code == 201 and r2.json()["id"] == r1.json()["id"]
        r3 = client.post(
            "/api/publicidad/destacar",
            json={"publicacion_id": 1, "plan_id": 1},
            headers={**ARR, "Idempotency-Key": "test-destacar-mock-02"},
        )
        assert r3.status_code == 409, r3.text
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_admin_pendientes_aprueba_rechaza():
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"], "pago_ref": "COMP-1"},
        headers={**ARR, "Idempotency-Key": "test-destacar-admin-01"},
    )
    assert r.status_code == 201, r.text
    d1 = r.json()
    # Pendientes visible para admin, prohibido para arrendador.
    rp = client.get("/api/admin/publicidad/pendientes", headers=ADMIN)
    assert rp.status_code == 200, rp.text
    pend = rp.json()
    pend = pend["items"] if isinstance(pend, dict) else pend
    assert any(x["id"] == d1["id"] for x in pend)
    assert client.get("/api/admin/publicidad/pendientes", headers=ARR).status_code == 403
    assert client.get("/api/admin/publicidad/pendientes").status_code == 401
    # Rechazar -> RECHAZADO y sale de pendientes.
    rr = client.patch(f"/api/admin/publicidad/{d1['id']}", json={"accion": "rechazar"}, headers=ADMIN)
    assert rr.status_code == 200, rr.text
    assert rr.json()["estado"] == "RECHAZADO"
    rp2 = client.get("/api/admin/publicidad/pendientes", headers=ADMIN).json()
    rp2 = rp2["items"] if isinstance(rp2, dict) else rp2
    assert all(x["id"] != d1["id"] for x in rp2)
    # RECHAZADO no bloquea un nuevo intento sobre la misma pub.
    r2 = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"], "pago_ref": "COMP-2"},
        headers={**ARR, "Idempotency-Key": "test-destacar-admin-02"},
    )
    assert r2.status_code == 201, r2.text
    d2 = r2.json()
    assert d2["id"] != d1["id"]
    # Aprobar -> ACTIVO + audit; repetir -> 409; nuevo destacar -> 409.
    ra = client.patch(f"/api/admin/publicidad/{d2['id']}", json={"accion": "aprobar"}, headers=ADMIN)
    assert ra.status_code == 200, ra.text
    assert ra.json()["estado"] == "ACTIVO"
    assert client.patch(f"/api/admin/publicidad/{d2['id']}", json={"accion": "aprobar"}, headers=ADMIN).status_code == 409
    r3 = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-destacar-admin-03"},
    )
    assert r3.status_code == 409, r3.text
    # PATCH admin inexistente / sin permiso.
    assert client.patch("/api/admin/publicidad/999999", json={"accion": "aprobar"}, headers=ADMIN).status_code == 404
    assert client.patch(f"/api/admin/publicidad/{d2['id']}", json={"accion": "aprobar"}, headers=ARR).status_code == 403
    # El dueño ve el estado final en mias.
    rm = client.get("/api/publicidad/mias", headers=ARR).json()
    rm = rm["items"] if isinstance(rm, dict) else rm
    por_id = {x["id"]: x["estado"] for x in rm}
    assert por_id.get(d1["id"]) == "RECHAZADO"
    assert por_id.get(d2["id"]) == "ACTIVO"


def _forzar_vence_pasado(destacado_id: int):
    """Pone vence en el pasado (PG o store mock)."""
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
    except Exception:
        from app.routers import publicidad as _pub
        d = next(x for x in _pub.MOCK_DESTACADOS if x["id"] == destacado_id)
        pasado = datetime.now(timezone.utc) - timedelta(hours=1)
        d["inicia"] = pasado - timedelta(days=1)
        d["vence"] = pasado


def _pub_estado_set(pub_id: int, estado: str) -> str:
    """Fija estado de la publicación (PG o MOCK_PUBS). Retorna el previo."""
    async def _run():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            prev = await conn.fetchval("SELECT estado FROM publicaciones WHERE id = $1;", pub_id)
            await conn.execute("UPDATE publicaciones SET estado = $1 WHERE id = $2;", estado, pub_id)
            return prev
        finally:
            await conn.close()
    try:
        return asyncio.run(_run())
    except Exception:
        from app.routers.publicaciones import MOCK_PUBS
        pub = next(p for p in MOCK_PUBS if p["id"] == pub_id)
        prev = pub["estado"]
        pub["estado"] = estado
        return prev


def test_admin_aprueba_vencido_409():
    """I1: aprobar PENDIENTE con vence pasado -> 409, no activa, sin APPROVED."""
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-aprueba-vencido-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    _forzar_vence_pasado(d["id"])

    ra = client.patch(f"/api/admin/publicidad/{d['id']}", json={"accion": "aprobar"}, headers=ADMIN)
    assert ra.status_code == 409, ra.text

    rm = client.get("/api/publicidad/mias", headers=ARR).json()
    rm = rm["items"] if isinstance(rm, dict) else rm
    assert {x["id"]: x["estado"] for x in rm}.get(d["id"]) != "ACTIVO"


def test_admin_aprueba_pub_no_activo_409():
    """I1: aprobar con pub ya no-ACTIVO (pausada) -> 409, no activa."""
    plan = _plan_7d()
    pub_id = _pub_activo_propia()
    r = client.post(
        "/api/publicidad/destacar",
        json={"publicacion_id": pub_id, "plan_id": plan["id"]},
        headers={**ARR, "Idempotency-Key": "test-aprueba-noactivo-01"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    prev = _pub_estado_set(pub_id, "PAUSADO")
    try:
        ra = client.patch(f"/api/admin/publicidad/{d['id']}", json={"accion": "aprobar"}, headers=ADMIN)
        assert ra.status_code == 409, ra.text
    finally:
        _pub_estado_set(pub_id, prev)

    rm = client.get("/api/publicidad/mias", headers=ARR).json()
    rm = rm["items"] if isinstance(rm, dict) else rm
    assert {x["id"]: x["estado"] for x in rm}.get(d["id"]) != "ACTIVO"
