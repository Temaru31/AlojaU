"""T8 blindaje - anti-spam/brute-force + mocks bloqueados en prod + HSTS.

Cubre (Excel 05_SEGURIDAD, controles que faltaban con test):
- Login 5 intentos/min por IP -> 429 (B0-7 ya existía en código, sin test).
- Mock-token en endpoint REAL con ENV=prod -> 401 (cadena completa, no solo unit).
- HSTS solo en prod (dev http://localhost intacto).
- Decisión C4: reportes se queda en 5/min/IP (anónimo, anti-spam+tumba-confianza),
  NO se sube a 60/min: 60 reportes falsos/min degradarían el índice Trust.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_mod

client = TestClient(app)


def _reset_login():
    auth_mod._LOGIN_ATTEMPTS.clear()


def test_t8_login_sexto_intento_429():
    _reset_login()
    payload = {"email": "nadie@alojau.com", "password": "xxxxxx"}
    codes = [client.post("/api/auth/login", json=payload).status_code for _ in range(6)]
    assert codes[-1] == 429
    assert codes[0] in (401, 503)  # dev: 401 mock/DB; sin PG: 503 solo si mock off
    _reset_login()


def test_t8_mock_bloqueado_en_prod_endpoint_real(monkeypatch):
    """Bearer mock-token-admin contra GET /api/reportes con ENV=prod -> 401."""
    from app.core import config as cfg_mod

    monkeypatch.setattr(cfg_mod.settings, "ENV", "prod", raising=False)
    monkeypatch.setattr(cfg_mod.settings, "USE_MOCK_FALLBACK", True, raising=False)
    r = client.get("/api/reportes", headers={"Authorization": "Bearer mock-token-admin"})
    assert r.status_code == 401


def test_t8_hsts_solo_prod(monkeypatch):
    from app.core import config as cfg_mod

    monkeypatch.setattr(cfg_mod.settings, "ENV", "prod", raising=False)
    r_prod = client.get("/health")
    assert r_prod.headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"

    monkeypatch.setattr(cfg_mod.settings, "ENV", "dev", raising=False)
    r_dev = client.get("/health")
    assert "Strict-Transport-Security" not in r_dev.headers
