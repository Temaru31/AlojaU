"""
SEC-rls-verify: fail-closed prod - mock tokens deben ser 401 en prod.
Backend usa owner asyncpg (bypassa RLS); seguridad prod depende de
ENV=prod + USE_MOCK_FALLBACK=False + SECRET fuerte (config.py).
"""
import pytest
from fastapi import HTTPException


def test_prod_mock_401(monkeypatch):
    """mock-token-arrendador debe ser 401 cuando ENV=prod (aunque USE_MOCK True)."""
    monkeypatch.setenv("ENV", "prod")
    from app.core import config as cfg_mod
    from app.core import security as sec_mod

    # Fuerza singleton a estado prod con mock habilitado (peor caso)
    monkeypatch.setattr(cfg_mod.settings, "ENV", "prod", raising=False)
    monkeypatch.setattr(cfg_mod.settings, "USE_MOCK_FALLBACK", True, raising=False)

    with pytest.raises(HTTPException) as exc:
        sec_mod.get_current_user(authorization="Bearer mock-token-arrendador")
    assert exc.value.status_code == 401


def test_prod_fail_closed_no_arranca_con_mock_true():
    """Settings(ENV=prod, USE_MOCK=True) debe lanzar ValidationError."""
    from pydantic import ValidationError
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            ENV="prod",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            SECRET_KEY="a" * 64,
            USE_MOCK_FALLBACK=True,
            CORS_ORIGINS="https://aloja-u.vercel.app",
        )


def test_prod_fail_closed_secret_default():
    """Settings(ENV=prod) con SECRET default debe lanzar ValidationError."""
    from pydantic import ValidationError
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            ENV="prod",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            SECRET_KEY="cambia_esto_en_produccion_muy_largo_32_chars_min",
            USE_MOCK_FALLBACK=False,
            CORS_ORIGINS="https://aloja-u.vercel.app",
        )
