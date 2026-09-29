"""OAuth hardening — anti spinner-eterno del lado API + anti-abuso.

Cubre el endurecimiento del callback Google (rama fix/oauth-hang-hardening):
- Payloads malformados -> 422 rápido (nunca cuelgue ni 500).
- Rate-limit en memoria 10/min por IP -> 429 (sin PG, determinista).
- JWT rechazado -> warning estructurado con kid/alg, SIN token ni PII.
- Avatar no-https -> 422 (falla cerrado, no crea usuario).

Auto-limpieza: prefijo test_oauth_tmp_* + purga PG/mocks + _OAUTH_ATTEMPTS.
"""
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router
from app.routers.auth import GoogleCallbackIn, _verificar_jwt_google

client = TestClient(app)
TMP_PREFIX = "test_oauth_tmp_"


def tmp_email(tag=""):
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


@pytest.fixture()
def limpieza():
    auth_router._OAUTH_ATTEMPTS.clear()
    creados = []
    yield creados
    auth_router._OAUTH_ATTEMPTS.clear()
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
                    "SELECT id FROM usuarios WHERE email LIKE 'test_oauth_tmp_%'")
                for r in ids:
                    await conn.execute("DELETE FROM sesiones WHERE usuario_id=$1", r["id"])
                    await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
            finally:
                await conn.close()

        asyncio.run(_del())
    except Exception:
        pass


def _callback(email, **extra):
    body = {"email": email, "nombre_completo": "Temporal OAuth"}
    body.update(extra)
    return client.post("/api/auth/oauth/google/callback", json=body)


# --- Payloads malformados: 422 rápido ---------------------------------------
def test_callback_sin_email_422(limpieza):
    r = client.post("/api/auth/oauth/google/callback",
                    json={"nombre_completo": "Sin Email"})
    assert r.status_code == 422


def test_callback_email_invalido_422(limpieza):
    r = _callback("no-es-email")
    assert r.status_code == 422


def test_callback_foto_no_https_422_sin_crear_usuario(limpieza):
    email = tmp_email("foto")
    limpieza.append(email)
    r = _callback(email, foto_perfil_url="http://evil.com/x.jpg")
    assert r.status_code == 422
    assert email not in auth_router.MOCK_USERS


# --- Rate-limit en memoria: 10 OK + 11vo 429 ---------------------------------
def test_callback_rate_limit_memoria_429(limpieza):
    email = tmp_email("rl")
    limpieza.append(email)
    for _ in range(10):
        r = _callback(email)
        assert r.status_code == 200, r.text
    bloqueado = _callback(email)
    assert bloqueado.status_code == 429
    assert "Google" in bloqueado.json()["detail"]


# --- Observabilidad: warning con kid/alg, sin PII ni token -------------------
def test_jwt_rechazado_loggea_warning_sin_pii(monkeypatch, caplog):
    from app.core import auth_service as svc

    def _falla(self, token):
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    monkeypatch.setattr(svc.SupabaseAuthService, "decode_token", _falla)
    data = GoogleCallbackIn(
        email="alguien@ejemplo.com", nombre_completo="Alguien",
        supabase_jwt="encabezado.firma.roto",
    )
    async def _run():
        await _verificar_jwt_google(data)

    import asyncio
    with caplog.at_level("WARNING", logger="alojau.auth"):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(_run())
    assert exc.value.status_code == 401
    assert any("JWT rechazado" in rec.message for rec in caplog.records)
    for rec in caplog.records:
        blob = rec.message + str(rec.args)
        assert "encabezado.firma.roto" not in blob
        assert "alguien@ejemplo.com" not in blob
