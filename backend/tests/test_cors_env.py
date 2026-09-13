"""OLA2-M3: dominio CORS prod canónico + fail-fast de typo.
El dominio real (dashboard Vercel) es https://aloja-u.vercel.app (con guion).
"""
import pathlib

import pytest
from pydantic import ValidationError

from app.core.config import CANONICAL_PROD_ORIGIN, TYPO_PROD_ORIGIN, Settings

RENDER_YAML = pathlib.Path(__file__).resolve().parent.parent.parent / "render.yaml"


def _prod_settings(**over):
    base = dict(
        ENV="prod",
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
        SECRET_KEY="x" * 64,
        USE_MOCK_FALLBACK=False,
        CORS_ORIGINS=CANONICAL_PROD_ORIGIN,
    )
    base.update(over)
    return Settings(**base)


def test_prod_acepta_dominio_canonico():
    s = _prod_settings()
    assert CANONICAL_PROD_ORIGIN in s.cors_origins_list


def test_prod_rechaza_dominio_con_typo():
    with pytest.raises(ValidationError):
        _prod_settings(CORS_ORIGINS=TYPO_PROD_ORIGIN)


def test_render_yaml_usa_dominio_canonico():
    text = RENDER_YAML.read_text(encoding="utf-8")
    assert CANONICAL_PROD_ORIGIN in text
    assert TYPO_PROD_ORIGIN not in text
