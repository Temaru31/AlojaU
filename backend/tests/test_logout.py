"""M1 cierre total de sesión: /logout revoca el token actual, /logout-all todo.

Idempotencia: repetir logout o usar un token ya revocado responde 200 igual
(el frontend limpia el estado local de todas formas).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
TMP_PREFIX = "test_user_tmp_"


def tmp_email(tag=""):
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


@pytest.fixture()
def limpieza():
    creados = []
    # Aislamiento anti rate-limit entre archivos (límite 5 logins/min por IP).
    auth_router._LOGIN_ATTEMPTS.clear()
    yield creados
    auth_router._LOGIN_ATTEMPTS.clear()
    for e in list(creados):
        auth_router.MOCK_USERS.pop(e, None)
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


def _login(limpieza, tag, pw="Logout1!x"):
    import asyncio
    email = tmp_email(tag)
    limpieza.append(email)
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Logout",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u is None:
                raise RuntimeError("sin PG real")
            u.email_verificado = True
            await db.commit()
    try:
        asyncio.run(_ver())
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_logout_revoca_token_actual(limpieza):
    h = _login(limpieza, "lo")
    assert client.get("/api/auth/perfil", headers=h).status_code == 200
    r = client.post("/api/auth/logout", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["revocadas"] == 1
    # El token viejo ya no abre nada (efecto fantasma imposible en API).
    assert client.get("/api/auth/perfil", headers=h).status_code == 401
    # Idempotente: repetir responde 200 igual.
    assert client.post("/api/auth/logout", headers=h).status_code == 200


def test_logout_sin_token_responde_200(limpieza):
    assert client.post("/api/auth/logout").status_code == 200
    r = client.post("/api/auth/logout", headers={"Authorization": "Bearer invalido"})
    assert r.status_code == 200


def test_logout_all_revoca_todas(limpieza):
    h = _login(limpieza, "loa")
    assert client.get("/api/auth/perfil", headers=h).status_code == 200
    r = client.post("/api/auth/logout-all", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["revocadas"] >= 1
    assert client.get("/api/auth/perfil", headers=h).status_code == 401
