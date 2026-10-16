"""v13.1 blindaje — IP real tras proxy, fallback de nombre, soft-delete.
Auto-limpieza: prefijo test_user_tmp_* + purga PG/mocks en teardown.
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router
from app.routers.auth import _client_ip, GoogleCallbackIn

client = TestClient(app)
TMP_PREFIX = "test_user_tmp_"


def tmp_email(tag=""):
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


@pytest.fixture()
def limpieza():
    creados = []
    yield creados
    for e in list(creados):
        auth_router.MOCK_USERS.pop(e, None)
        auth_router._MOCK_OTPS.pop(f"{e}:email_verify", None)
        auth_router._MOCK_RESETS.pop(e, None)
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._PW_ATTEMPTS.clear()
    try:
        import asyncio
        import os

        async def _del():
            import asyncpg
            raw = os.getenv("DATABASE_URL",
                            "postgresql://alojau:alojau123@localhost:5432/alojau")
            dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
            if "supabase.co" in dsn.lower():
                return
            try:
                conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=5)
            except Exception:
                return
            try:
                ids = await conn.fetch(
                    "SELECT id FROM usuarios WHERE email LIKE 'test_user_tmp_%'")
                for r in ids:
                    await conn.execute("DELETE FROM sesiones WHERE usuario_id=$1", r["id"])
                    await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
            finally:
                await conn.close()

        asyncio.run(_del())
    except Exception:
        pass


def _req(headers=None, host="10.0.0.5"):
    return SimpleNamespace(headers=headers or {},
                           client=SimpleNamespace(host=host))


# --- IP real tras proxy ------------------------------------------------------
def test_ip_x_forwarded_for_primera():
    r = _req({"x-forwarded-for": "203.0.113.7, 10.0.0.1, 172.16.0.1"})
    assert _client_ip(r) == "203.0.113.7"


def test_ip_headers_aunque_client_none():
    r = SimpleNamespace(headers={"x-forwarded-for": "198.51.100.9"}, client=None)
    assert _client_ip(r) == "198.51.100.9"


def test_ip_x_real_ip_fallback():
    assert _client_ip(_req({"x-real-ip": "192.0.2.44"})) == "192.0.2.44"


def test_ip_invalida_se_descarta():
    r = _req({"x-forwarded-for": "no-es-ip, 203.0.113.8"})
    # La primera inválida se salta, gana la primera válida.
    assert _client_ip(r) == "203.0.113.8"


def test_ip_sin_nada_unknown():
    assert _client_ip(None) == "unknown"
    assert _client_ip(SimpleNamespace(headers={}, client=None)) == "unknown"


# --- Fallback nombre Google --------------------------------------------------
def test_nombre_corto_no_422_fallback():
    m = GoogleCallbackIn(email="a@domain.com", nombre_completo="a")
    assert len(m.nombre_completo) >= 2
    assert "a" in m.nombre_completo


def test_nombre_normal_intacto():
    m = GoogleCallbackIn(email="x@y.com", nombre_completo="María José")
    assert m.nombre_completo == "María José"


def test_callback_con_nombre_1char_200(limpieza):
    email = tmp_email("g1")
    limpieza.append(email)
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": email, "nombre_completo": "z",
        "supabase_id": f"sup-{uuid.uuid4().hex[:8]}"})
    assert r.status_code == 200, r.text


# --- Soft-delete --------------------------------------------------------------
def _registrar(email, pw="Segura1!x"):
    return client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Borrable",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True})


def test_eliminar_restaurar_flujo(limpieza):
    email = tmp_email("del")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Segura1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    # Email de confirmación distinto -> 422.
    bad = client.request("DELETE", "/api/auth/cuenta",
                         json={"confirm_email": tmp_email("otro"), "password": "Segura1!x"},
                         headers=h)
    assert bad.status_code == 422
    # Password mala -> 403.
    bad2 = client.request("DELETE", "/api/auth/cuenta",
                          json={"confirm_email": email, "password": "Mala1!xxxx"},
                          headers=h)
    assert bad2.status_code == 403
    # OK.
    d = client.request("DELETE", "/api/auth/cuenta",
                       json={"confirm_email": email, "password": "Segura1!x"}, headers=h)
    assert d.status_code == 200, d.text
    assert d.json()["gracia_dias"] == 30
    # Login bloqueado con guía de restore.
    l = client.post("/api/auth/login", json={"email": email, "password": "Segura1!x"})
    assert l.status_code == 403
    assert "restaurar" in l.json()["detail"]
    # Re-registro bloqueado con 409.
    assert _registrar(email).status_code == 409
    # Restore revive + emite sesión.
    r = client.post("/api/auth/cuenta/restaurar",
                    json={"email": email, "password": "Segura1!x"})
    assert r.status_code == 200, r.text
    assert client.post("/api/auth/login",
                       json={"email": email, "password": "Segura1!x"}).status_code == 200


def test_google_revive_cuenta_en_gracia(limpieza):
    email = tmp_email("grev")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Segura1!x"}).json()["access_token"]
    client.request("DELETE", "/api/auth/cuenta",
                   json={"confirm_email": email, "password": "Segura1!x"},
                   headers={"Authorization": f"Bearer {tok}"})
    g = client.post("/api/auth/oauth/google/callback", json={
        "email": email, "nombre_completo": "Temporal Google",
        "supabase_id": f"sup-{uuid.uuid4().hex[:8]}"})
    assert g.status_code == 200, g.text
    perfil = client.get("/api/auth/perfil",
                        headers={"Authorization": f"Bearer {g.json()['access_token']}"})
    assert perfil.status_code == 200


def test_purga_admin(limpieza):
    h = {"Authorization": "Bearer mock-token-admin"}
    r = client.post("/api/admin/cuentas/purgar", headers=h)
    assert r.status_code == 200
    assert "purgadas" in r.json()
    # No-admin -> 403.
    email = tmp_email("noadm")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Segura1!x"}).json()["access_token"]
    r2 = client.post("/api/admin/cuentas/purgar",
                     headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 403
