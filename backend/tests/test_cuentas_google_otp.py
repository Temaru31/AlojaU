"""M2/M3: cuentas Google sin contraseña + canal OTP + user_agent en sesiones.

- Google (`auth_provider='google'`): cambia-password no aplica y la cuenta se
  elimina solo con email (sin contraseña actual).
- OTP solicitar expone `canal` ("email" en dev sin bot).
- GET /sesiones incluye `user_agent` (aditivo, puede ser None).
"""
import asyncio
import os
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
    auth_router._MOCK_OTPS.clear()

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
                await conn.execute("DELETE FROM password_resets WHERE email IN (SELECT email FROM usuarios WHERE id=$1)", r["id"])
                await conn.execute("DELETE FROM otp_codes WHERE email IN (SELECT email FROM usuarios WHERE id=$1)", r["id"])
                await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
        finally:
            await conn.close()
    try:
        asyncio.run(_del())
    except Exception:
        pass


def _registrar_y_token(limpieza, tag, pw="Google1!x"):
    email = tmp_email(tag)
    limpieza.append(email)
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Google",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

    async def _marcar_google():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u is None:
                raise RuntimeError("sin PG real")
            u.auth_provider = "google"
            u.email_verificado = True
            await db.commit()
    try:
        asyncio.run(_marcar_google())
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return email, pw, {"Authorization": f"Bearer {tok}"}


def test_google_elimina_solo_con_email(limpieza):
    email, pw, h = _registrar_y_token(limpieza, "goo")
    # Sin password en el body: el backend la exige solo si provider=='password'.
    r = client.request("DELETE", "/api/auth/cuenta",
                       json={"confirm_email": email}, headers=h)
    assert r.status_code == 200, r.text
    # La cuenta quedó en gracia: login guiado a restaurar, no credenciales.
    r2 = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert r2.status_code == 403, r2.text


def test_password_exige_contrasena_actual(limpieza):
    email, pw, h = _registrar_y_token(limpieza, "pwd")

    async def _marcar_password():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            u.auth_provider = "password"
            await db.commit()
    asyncio.run(_marcar_password())
    r = client.request("DELETE", "/api/auth/cuenta",
                       json={"confirm_email": email}, headers=h)
    assert r.status_code == 403, r.text


def test_otp_solicitar_expone_canal_email_en_dev(limpieza):
    email = tmp_email("otp")
    limpieza.append(email)
    r = client.post("/api/auth/otp/solicitar",
                    json={"email": email, "proposito": "email_verify"})
    assert r.status_code == 202, r.text
    assert r.json()["canal"] == "email"


def test_sesiones_incluyen_user_agent(limpieza):
    _, _, h = _registrar_y_token(limpieza, "ses")
    r = client.get("/api/auth/sesiones", headers={**h, "User-Agent": "pytest-agent/1.0"})
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) >= 1
    assert "user_agent" in items[0]
