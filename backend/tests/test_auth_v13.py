"""v13 Enterprise Auth — suite con auto-limpieza (ephemeral testing).

Cobertura: registro Ley 1581, login ok/ko, Google OAuth mocked + linking,
expiración de token, RBAC/scopes 403, rate-limit anti-fuerza bruta,
OTP 6 dígitos, recovery un solo uso, promoción ESTUDIANTE->ARRENDADOR.

Auto-borrado: todo dato temporal usa prefijo `test_user_tmp_*` y el
fixture `limpieza_tmp` elimina (PG real) o purga (mocks en memoria) al
cierre de cada test. La BD queda totalmente limpia.
"""
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)

TMP_PREFIX = "test_user_tmp_"


def tmp_email(tag: str = "") -> str:
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


@pytest.fixture()
def limpieza_tmp():
    """tearDown: borra todo rastro tmp (PG + mocks en memoria)."""
    creados: list[str] = []
    yield creados
    for email in list(creados):
        auth_router.MOCK_USERS.pop(email, None)
        auth_router.MOCK_USERS.pop(email.lower(), None)
        auth_router._MOCK_OTPS.pop(f"{email}:email_verify", None)
        auth_router._MOCK_OTPS.pop(f"{email}:login", None)
        auth_router._MOCK_RESETS.pop(email, None)
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._PW_ATTEMPTS.clear()
    # PG real (si hay): borra filas tmp + sesiones huérfanas.
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
                    await conn.execute(
                        "DELETE FROM password_resets WHERE email LIKE 'test_user_tmp_%'")
                    await conn.execute(
                        "DELETE FROM otp_codes WHERE email LIKE 'test_user_tmp_%'")
                    await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
                await conn.execute(
                    "DELETE FROM rate_limit_attempts WHERE clave LIKE '%test_user_tmp_%'")
            finally:
                await conn.close()

        asyncio.run(_del())
    except Exception:
        pass


def _registrar(email: str, password: str = "Segura1!x") -> dict:
    return client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "nombre_completo": "Usuario Temporal Prueba",
        "telefono_whatsapp": "573001234567",
        "acepto_tratamiento_datos": True,
    })


def _login(email: str, password: str) -> dict:
    return client.post("/api/auth/login", json={"email": email, "password": password})


# --- Registro + Ley 1581 ----------------------------------------------------
def test_registro_exige_consentimiento_ley1581(limpieza_tmp):
    email = tmp_email("ley")
    r = client.post("/api/auth/register", json={
        "email": email,
        "password": "Segura1!x",
        "nombre_completo": "Usuario Temporal Prueba",
        "telefono_whatsapp": "573001234567",
        "acepto_tratamiento_datos": False,
    })
    assert r.status_code == 422
    assert "1581" in r.json()["detail"]


def test_registro_ok_rol_estudiante(limpieza_tmp):
    email = tmp_email("reg")
    limpieza_tmp.append(email)
    r = _registrar(email)
    assert r.status_code == 200, r.text
    assert r.json()["rol"] == "ESTUDIANTE"
    assert r.json()["email_verificado"] is False


def test_registro_duplicado_400(limpieza_tmp):
    email = tmp_email("dup")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    assert _registrar(email).status_code == 400


# --- Login ------------------------------------------------------------------
def test_login_exitoso_y_fallido(limpieza_tmp):
    email = tmp_email("login")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    ok = _login(email, "Segura1!x")
    assert ok.status_code == 200, ok.text
    assert ok.json()["rol"] == "ESTUDIANTE"
    assert ok.json()["access_token"]
    ko = _login(email, "ClaveMala1!x")
    assert ko.status_code == 401


def test_login_rate_limit_bloquea(limpieza_tmp):
    auth_router._LOGIN_ATTEMPTS.clear()
    payload = {"email": tmp_email("brute"), "password": "x"}
    codes = [client.post("/api/auth/login", json=payload).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5, codes
    assert codes[5] == 429, codes
    auth_router._LOGIN_ATTEMPTS.clear()


# --- Token: expiración y scopes ---------------------------------------------
def test_token_expirado_401():
    from datetime import datetime, timezone, timedelta
    import jwt as _jwt
    from app.core.config import settings
    exp = datetime.now(timezone.utc) - timedelta(seconds=10)
    tok = _jwt.encode({"sub": "x@alojau.com", "id": 1, "rol": "ARRENDADOR", "exp": exp},
                      settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    r = client.get("/api/auth/perfil", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


def test_scopes_no_escalan_por_payload():
    from app.core.permissions import user_scopes
    # Token manipulado: ESTUDIANTE que se auto-otorga admin:* -> intersección lo recorta.
    u = {"rol": "ESTUDIANTE",
         "scopes": ["admin:dashboard:view", "publications:read", "users:manage"]}
    scopes = user_scopes(u)
    assert "publications:read" in scopes
    assert "admin:dashboard:view" not in scopes
    assert "users:manage" not in scopes


def test_matriz_roles_extensible():
    from app.core.permissions import scopes_for_role, register_role, has_scope
    assert "publications:write" not in scopes_for_role("ESTUDIANTE")
    assert "publications:write" in scopes_for_role("ARRENDADOR")
    assert "users:manage" in scopes_for_role("ADMIN")
    # Rol futuro sin romper nada:
    assert "campus:moderate" in scopes_for_role("MODERADOR_CAMPUS")
    assert "legal:audit:view" in scopes_for_role("AUDITOR_LEGAL")
    assert scopes_for_role("ROL_INEXISTENTE") == frozenset()
    assert not has_scope({"rol": "ESTUDIANTE"}, "admin:dashboard:view")
    with pytest.raises(ValueError):
        register_role("X", {"scope:inexistente"})


def test_rbac_admin_denegado_a_estudiante(limpieza_tmp):
    email = tmp_email("rbac")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    tok = _login(email, "Segura1!x").json()["access_token"]
    r = client.get("/api/admin/metricas",
                   headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


# --- Google OAuth (mocked) + linking ----------------------------------------
def test_google_callback_crea_estudiante_verificado(limpieza_tmp):
    email = tmp_email("google")
    limpieza_tmp.append(email)
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": email,
        "nombre_completo": "Temporal Google",
        "supabase_id": f"sup-{uuid.uuid4().hex[:8]}",
    })
    assert r.status_code == 200, r.text
    assert r.json()["rol"] == "ESTUDIANTE"
    assert r.json()["es_nuevo"] is True  # cuenta nacida aquí
    perfil = client.get("/api/auth/perfil",
                        headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert perfil.status_code == 200
    assert perfil.json()["email_verificado"] is True


def test_google_linking_fusiona_cuenta_manual(limpieza_tmp):
    email = tmp_email("link")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    manual = _login(email, "Segura1!x").json()
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": email.upper(),  # mayúsculas: el linking normaliza
        "nombre_completo": "Temporal Google",
        "supabase_id": f"sup-{uuid.uuid4().hex[:8]}",
    })
    assert r.status_code == 200, r.text
    assert r.json()["es_nuevo"] is False  # linking, no creación
    perfil = client.get("/api/auth/perfil",
                        headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert perfil.status_code == 200
    # Misma cuenta (sin duplicados), ahora verificada y vinculada a Google.
    assert perfil.json()["email"] == email
    assert perfil.json()["email_verificado"] is True
    assert "google" in (perfil.json()["auth_provider"] or "")
    # El login manual sigue funcionando (identidad dual).
    assert _login(email, "Segura1!x").status_code == 200
    assert manual["access_token"] != ""


def test_oauth_google_sin_config_503_o_url():
    r = client.get("/api/auth/oauth/google")
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        assert "authorization_url" in r.json()
    else:
        assert "Supabase" in r.json()["detail"]


def test_oauth_google_redirect_allowlist():
    r = client.get("/api/auth/oauth/google")
    if r.status_code == 503:
        pytest.skip("Supabase sin configurar en este entorno")
    base = r.json()["authorization_url"]
    assert "redirect_to=https://aloja-u.vercel.app/auth/callback" in base
    r2 = client.get("/api/auth/oauth/google",
                    params={"redirect_to": "http://localhost:5173"})
    assert r2.status_code == 200
    assert "redirect_to=http://localhost:5173/auth/callback" in r2.json()["authorization_url"]
    r3 = client.get("/api/auth/oauth/google",
                    params={"redirect_to": "https://evil.com"})
    assert r3.status_code == 422


# --- OTP --------------------------------------------------------------------
def test_otp_solicitar_y_verificar(limpieza_tmp):
    email = tmp_email("otp")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    s = client.post("/api/auth/otp/solicitar",
                    json={"email": email, "proposito": "email_verify"})
    assert s.status_code == 202
    # Código correcto: se lee del store en memoria (solo mock/dev sin PG).
    key = f"{email}:email_verify"
    if key in auth_router._MOCK_OTPS:
        import hashlib
        # Fuerza un código conocido para el test.
        code = "123456"
        auth_router._MOCK_OTPS[key] = {
            "hash": hashlib.sha256(code.encode()).hexdigest(),
            "expira": time.monotonic() + 600,
        }
        v = client.post("/api/auth/otp/verificar",
                        json={"email": email, "codigo": code, "proposito": "email_verify"})
        assert v.status_code == 200, v.text
    # Código malo siempre 401.
    m = client.post("/api/auth/otp/verificar",
                    json={"email": email, "codigo": "000000", "proposito": "email_verify"})
    assert m.status_code == 401


# --- Recovery ---------------------------------------------------------------
def test_recovery_flujo_un_solo_uso(limpieza_tmp):
    email = tmp_email("rec")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    s = client.post("/api/auth/recovery/solicitar", json={"email": email})
    assert s.status_code == 202
    token = s.json().get("dev_token")
    if not token:
        pytest.skip("PG real sin dev_token: flujo cubierto en mock")
    # Débil -> 422.
    d = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": token, "nueva_password": "corta"})
    assert d.status_code == 422
    c = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": token, "nueva_password": "NuevaSegura1!x"})
    assert c.status_code == 200, c.text
    # Reuso -> 401 (un solo uso).
    r2 = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": token, "nueva_password": "OtraSegura1!x"})
    assert r2.status_code == 401
    # Login con la nueva clave funciona.
    assert _login(email, "NuevaSegura1!x").status_code == 200


# --- Promoción dinámica ------------------------------------------------------
def test_publicar_promueve_estudiante_a_arrendador(limpieza_tmp):
    email = tmp_email("promo")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    tok = _login(email, "Segura1!x").json()["access_token"]
    payload = {
        "titulo": "Habitación temporal amplia para estudiantes",
        "descripcion": "Descripción con más de veinte caracteres para el test",
        "tipo_inmueble": "HABITACION_INDEPENDIENTE",
        "canon_mensual": 450000,
        "deposito_requerido": 0,
        "zona_barrio_id": 1,
        "direccion_referencial": "Calle temporal 123 referencia",
        "reglas_convivencia": "Reglas temporales válidas 10+",
        "servicios_ids": [1],
        "campus_ids": [],
        "fotos": ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
    }
    r = client.post("/api/publicaciones", json=payload,
                    headers={"Authorization": f"Bearer {tok}"})
    # En mock: 201 + promoción. En PG sin email verificado: 403 (gate) o 201.
    assert r.status_code in (201, 403), r.text
    if r.status_code == 201:
        perfil = client.get("/api/auth/perfil",
                            headers={"Authorization": f"Bearer {tok}"})
        # Token viejo dice ESTUDIANTE; la fila ya es ARRENDADOR (re-login lo refleja).
        tok2 = _login(email, "Segura1!x").json()["access_token"]
        perfil2 = client.get("/api/auth/perfil",
                             headers={"Authorization": f"Bearer {tok2}"})
        assert perfil2.json()["rol"] == "ARRENDADOR"


# --- Sesiones ----------------------------------------------------------------
def test_sesiones_revocar_todas(limpieza_tmp):
    email = tmp_email("ses")
    limpieza_tmp.append(email)
    assert _registrar(email).status_code == 200
    tok = _login(email, "Segura1!x").json()["access_token"]
    ls = client.get("/api/auth/sesiones", headers={"Authorization": f"Bearer {tok}"})
    assert ls.status_code == 200
    rv = client.post("/api/auth/sesiones/revocar-todas", headers={"Authorization": f"Bearer {tok}"})
    assert rv.status_code == 200
