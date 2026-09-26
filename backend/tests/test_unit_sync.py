"""Unitarios sync sin DB (rápidos, corren en PG y en mock).

Cubren ramas que los tests API no alcanzan porque el coverage no registra
líneas posteriores al primer `await` en endpoints async: validaciones,
helpers puros, expiración JWT, cachés y builders de expresiones SQL.
"""
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from app.core.config import Settings, settings
from app.core.security import (
    create_token,
    decode_token,
    get_optional_user,
)
from app.db.session import _normalize_supabase_url
from app.services import publicacion_view as view
from app.services.haversine import haversine_km, tiempo_pie_min
from app.services.search import (
    clean_query_for_fts,
    escape_ilike,
    tipo_canonico_para_token,
    tokenize_query,
)
from app.services.trust import dias_desde


# --- JWT / auth sync ---------------------------------------------------------

def test_token_roundtrip_y_decode():
    t = create_token({"sub": "a@x.co", "rol": "ARRENDADOR", "id": 1})
    data = decode_token(t)
    assert data["sub"] == "a@x.co" and data["rol"] == "ARRENDADOR"


def test_token_expirado_401_explicit():
    pasado = datetime.now(timezone.utc) - timedelta(hours=1)
    t = jwt.encode(
        {"sub": "a@x.co", "exp": pasado},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(HTTPException) as ei:
        decode_token(t)
    assert ei.value.status_code == 401


def test_token_sin_sub_401():
    futuro = datetime.now(timezone.utc) + timedelta(hours=1)
    t = jwt.encode({"exp": futuro}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    with pytest.raises(HTTPException) as ei:
        decode_token(t)
    assert ei.value.status_code == 401


def test_optional_user_none_e_invalido():
    import asyncio
    assert asyncio.run(get_optional_user(None)) is None
    assert asyncio.run(get_optional_user("Bearer totalmente.invalido")) is None


# --- vista sync --------------------------------------------------------------

PUB = {
    "id": 1, "estado": "ACTIVO", "canon_mensual": 500000,
    "tipo_inmueble": "APARTAESTUDIO", "servicios_ids": [1],
    "campus_ids": [1], "latitud": 2.44, "longitud": -76.6,
}


def test_whatsapp_link_sin_tel_none():
    assert view.whatsapp_link("T", 1, None) is None
    assert view.whatsapp_link("T", 1, "") is None
    link = view.whatsapp_link("T", 1, "573001234567")
    assert link.startswith("https://wa.me/573001234567?text=")


def test_filter_mock_ciudad_desconocida_vacia():
    assert view.filter_mock_pubs([PUB], ciudad_slug="bogota") == []


def test_filter_mock_ciudad_popayan_y_id():
    assert view.filter_mock_pubs([PUB], ciudad_slug="popayan") == [PUB]
    assert view.filter_mock_pubs([PUB], ciudad_id=2) == []
    assert view.filter_mock_pubs([PUB], ciudad_id=1) == [PUB]


def test_filter_mock_poi_nuevo_ordena_sin_filtrar():
    pubs = [dict(PUB, id=1), dict(PUB, id=2)]
    out = view.filter_mock_pubs(pubs, campus_id=99)
    assert [p["id"] for p in out] == [1, 2]


def test_filter_mock_servicios_y_stopwords():
    assert view.filter_mock_pubs([PUB], servicios_ids=[2]) == []
    assert view.filter_mock_pubs([PUB], servicios_ids=[1]) == [PUB]
    assert view.filter_mock_pubs([PUB], q="con de la") == [PUB]


def test_parse_servicios_param_ramas():
    assert view.parse_servicios_param(None) is None
    assert view.parse_servicios_param("1,2") == [1, 2]
    with pytest.raises(HTTPException) as ei:
        view.parse_servicios_param(",".join(["1"] * 51))
    assert ei.value.status_code == 400
    with pytest.raises(HTTPException) as ei:
        view.parse_servicios_param("1,2,x")
    assert ei.value.status_code == 400
    with pytest.raises(HTTPException) as ei:
        view.parse_servicios_param("0")
    assert ei.value.status_code == 400
    with pytest.raises(HTTPException) as ei:
        view.parse_servicios_param(",".join(["1"] * 11))
    assert ei.value.status_code == 400


# --- trust / haversine sync --------------------------------------------------

def test_dias_desde_none_y_naive():
    assert dias_desde(None) == 999
    naive = datetime.now() - timedelta(days=5)
    assert dias_desde(naive) == 5


def test_haversine_km_y_tiempo_pie_bordes():
    assert haversine_km(2.443, -76.606, 2.445, -76.61) > 0
    assert tiempo_pie_min(None) is None
    assert tiempo_pie_min("abc") is None
    assert tiempo_pie_min(0) == 1


# --- search sync -------------------------------------------------------------

def test_search_puros():
    assert tokenize_query("%_\"'") == []
    assert tokenize_query("apartamento con baño") == ["apartamento", "baño"]
    assert clean_query_for_fts(["a", "b"]) == "a b"
    esc = escape_ilike("100%_\\")
    assert "\\%" in esc and "\\_" in esc and "\\\\" in esc
    assert tipo_canonico_para_token("apartamento") == "APARTAESTUDIO"
    assert tipo_canonico_para_token("xyz") is None


# --- session / config sync ---------------------------------------------------

def test_normalize_supabase_url_ramas():
    base = "postgresql+asyncpg://a:b@localhost:5432/x"
    assert _normalize_supabase_url(base) == base
    assert _normalize_supabase_url("postgresql://a:b@localhost:5432/x") == base
    supa = "postgresql://u:p@aws-0.pooler.supabase.com:5432/postgres"
    assert "ssl=require" in _normalize_supabase_url(supa)
    assert _normalize_supabase_url(supa + "?ssl=require").endswith("ssl=require")


def test_config_validadores():
    with pytest.raises(Exception):
        Settings(ENV="invalido")
    with pytest.raises(Exception):
        Settings(SECRET_KEY="corto")
    with pytest.raises(Exception):
        Settings(ENV="prod")


# --- repo builders sin DB ----------------------------------------------------

def test_repo_builders_sin_db():
    from app.models import Publicacion
    from app.repositories import publicacion_repo as repo

    assert repo.fts_condition(Publicacion, "casa centro") is not None
    assert repo.tokens_or_condition(Publicacion, ["casa"]) is not None
    assert repo.resolver_modo_q(None) is None
    assert repo.resolver_modo_q("") is None
    assert repo.resolver_modo_q("  ") is None
    assert repo.resolver_modo_q("ab") == "fuzzy"
    assert repo.resolver_modo_q("abc") == "fts"
