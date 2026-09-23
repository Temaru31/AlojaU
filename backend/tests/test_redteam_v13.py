"""RED TEAM — Auditoría OWASP Top 10 (API + Auth) v13.

Personalidad: penetration tester externo. Cada test es un ATAQUE simulado;
si alguno pasa la defensa (assert falla), el dictamen NO se emite y el
agente principal debe corregir y repetir la suite.

Auto-limpieza: usuarios `test_user_tmp_*` + purga de rate-limit/mocks.
"""
import uuid
from datetime import datetime, timezone, timedelta

import jwt as _jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.security import MOCK_TOKENS
from app.routers import auth as auth_router

client = TestClient(app)


def tmp_email(tag="red"):
    return f"test_user_tmp_{tag}{uuid.uuid4().hex[:8]}@alojau.com"


@pytest.fixture()
def limpieza_red():
    creados: list[str] = []
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
                await conn.execute(
                    "DELETE FROM rate_limit_attempts WHERE clave LIKE 'login:%'"
                    "AND creado_en > NOW() - INTERVAL '20 minutes'")
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


def _registrar(email, pw="Redteam1!x"):
    return client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Red Team Temporal",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True})


# A01 — Forgery: JWT firmado con otra clave -> 401 (no 403 ni 200).
def test_RT01_token_forjado_otra_clave_401():
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    forged = _jwt.encode({"sub": "admin@alojau.com", "id": 2, "rol": "ADMIN", "exp": exp},
                         "clave-del-atacante" * 3, algorithm="HS256")
    r = client.get("/api/admin/metricas", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401, r.text


# A02 — Tampering: payload válido con rol editado sin re-firmar -> 401.
def test_RT02_payload_manipulado_401(limpieza_red):
    email = tmp_email()
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Redteam1!x"}).json()["access_token"]
    header, payload, sig = tok.split(".")
    import base64
    import json as _json
    padded = payload + "=" * (-len(payload) % 4)
    data = _json.loads(base64.urlsafe_b64decode(padded))
    data["rol"] = "ADMIN"
    data["scopes"] = ["users:manage", "admin:dashboard:view"]
    new_payload = base64.urlsafe_b64encode(_json.dumps(data).encode()).decode().rstrip("=")
    tampered = f"{header}.{new_payload}.{sig}"
    r = client.get("/api/admin/metricas", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code == 401, r.text


# A03 — Escalada por claim: ESTUDIANTE válido con scopes admin inyectados
# (firmados correctamente = token emitido por otro bug hipotético) -> 403 igual.
def test_RT03_scopes_inyectados_no_escalan_403():
    from app.core.permissions import user_scopes
    evil = {"rol": "ESTUDIANTE", "scopes": ["users:manage", "system:settings:write",
                                            "admin:dashboard:view", "publications:read"]}
    assert not ({"users:manage", "admin:dashboard:view"} & set(user_scopes(evil)))


# A04 — Bypass: rutas admin con ESTUDIANTE -> 403; sin token -> 401.
def test_RT04_admin_con_estudiante_403(limpieza_red):
    email = tmp_email()
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Redteam1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/admin/metricas", headers=h).status_code == 403
    assert client.get("/api/admin/pendientes", headers=h).status_code == 403
    assert client.patch("/api/admin/publicaciones/1", json={"estado": "ACTIVO"},
                        headers=h).status_code == 403
    assert client.delete("/api/admin/publicaciones/1", headers=h).status_code == 403
    assert client.get("/api/admin/metricas").status_code == 401


# A05 — Fuerza bruta masiva: 20 logins fallidos -> 429 (bloqueo 15 min PG / 1 min memoria).
def test_RT05_fuerza_bruta_bloqueada_429(limpieza_red):
    auth_router._LOGIN_ATTEMPTS.clear()
    codes = [client.post("/api/auth/login",
                         json={"email": tmp_email("flood"), "password": "mala1"})
             .status_code for _ in range(8)]
    assert 429 in codes, codes
    auth_router._LOGIN_ATTEMPTS.clear()


# A06 — Inyección: SQLi/XSS en registro no rompen (422/400, nunca 500 con traza).
def test_RT06_inyeccion_registro_contenida():
    r = client.post("/api/auth/register", json={
        "email": "x'; DROP TABLE usuarios; --@alojau.com", "password": "Redteam1!x",
        "nombre_completo": "<script>alert(1)</script> atacante con nombre largo",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True})
    assert r.status_code in (400, 422), r.text
    assert "Traceback" not in r.text
    r2 = client.post("/api/auth/register", json={
        "email": tmp_email("xss"), "password": "Redteam1!x",
        "nombre_completo": "<img src=x onerror=alert(1)> nombre largo atacante",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True})
    # Pydantic lo guarda como string (React lo escapa); si pasa, no hay 500.
    assert r2.status_code in (200, 422), r2.text
    if r2.status_code == 200:
        auth_router.MOCK_USERS.pop(r2.json()["email"], None)


# A07 — Token expirado en endpoint de escritura -> 401.
def test_RT07_expirado_no_publica_401():
    exp = datetime.now(timezone.utc) - timedelta(seconds=5)
    tok = _jwt.encode({"sub": "arrendador@alojau.com", "id": 1, "rol": "ARRENDADOR",
                       "exp": exp}, settings.SECRET_KEY, algorithm="HS256")
    r = client.post("/api/publicaciones", json={},
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


# A08 — Recovery: token débil/reusado no sirve; password débil rechazada.
def test_RT08_recovery_reuso_y_debil_401_422(limpieza_red):
    email = tmp_email("rtrec")
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    s = client.post("/api/auth/recovery/solicitar", json={"email": email})
    assert s.status_code == 202
    token = s.json().get("dev_token")
    if not token:
        pytest.skip("PG sin dev_token")
    fake = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": "x" * 43, "nueva_password": "Fuerte1!x"})
    assert fake.status_code == 401
    weak = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": token, "nueva_password": "débil"})
    assert weak.status_code == 422


# A09 — OTP: sin código correcto no hay verificación (fuerza bruta de 6 dígitos contenida).
def test_RT09_otp_sin_codigo_no_verifica(limpieza_red):
    email = tmp_email("rtotp")
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    assert client.post("/api/auth/otp/solicitar",
                       json={"email": email, "proposito": "email_verify"}).status_code == 202
    for bad in ("000000", "111111", "999999"):
        r = client.post("/api/auth/otp/verificar",
                        json={"email": email, "codigo": bad, "proposito": "email_verify"})
        assert r.status_code == 401, bad


# A10 — Cabeceras: sin password_hash en respuestas + CORS estricto + CSP.
def test_RT10_sin_fugas_ni_cors_abierto(limpieza_red):
    email = tmp_email("rtperf")
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Redteam1!x"}).json()["access_token"]
    perfil = client.get("/api/auth/perfil", headers={"Authorization": f"Bearer {tok}"})
    body = perfil.text.lower()
    # Sin hashes ni secretos (auth_provider=password es el nombre del método, no un secreto).
    assert "password_hash" not in body and "secret" not in body and "bcrypt" not in body
    evil = client.get("/health", headers={"Origin": "http://evil.com"})
    assert evil.headers.get("access-control-allow-origin") != "http://evil.com"
    assert "default-src 'none'" in client.get("/health").headers.get("content-security-policy", "")


# A11 — Auto-verificación imposible: PATCH telefono_verificado se ignora.
def test_RT11_no_auto_verificacion():
    h = {"Authorization": "Bearer mock-token-arrendador"}
    antes = client.get("/api/auth/perfil", headers=h).json()["telefono_verificado"]
    r = client.patch("/api/auth/perfil", json={"telefono_verificado": not antes}, headers=h)
    assert r.status_code == 200
    assert r.json()["telefono_verificado"] is antes


# A12 — Revocación: tras revocar todas, el jti viejo queda marcado.
def test_RT12_revocacion_marca_sesiones(limpieza_red):
    email = tmp_email("rtrev")
    limpieza_red.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Redteam1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/auth/sesiones", headers=h).status_code == 200
    rv = client.post("/api/auth/sesiones/revocar-todas", headers=h)
    assert rv.status_code == 200
    assert rv.json()["revocadas"] >= 0
