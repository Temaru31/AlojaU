"""Unidades puras para cerrar el gate de cobertura del CI (sin DB ni red).

Cada test bloquea un comportamiento documentado: niveles de confianza,
tiempos a pie, slugs multiciudad, tokenizado de búsqueda y selección del
backend de storage. Cero mocks de lógica propia.
"""
from types import SimpleNamespace

import pytest


def test_trust_niveles_medio_basico_y_dias():
    from app.services.trust import calcular_indice, dias_desde

    base = dict(canon_mensual=450000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO",
                reglas_convivencia="Reglas válidas con más de diez caracteres",
                direccion_referencial="Calle 5 # 4-70 referencia", servicios_ids=[1],
                telefono_verificado=True, num_fotos=5, dias_vigencia=0, reportes_activos=0)
    alto = calcular_indice(**base)
    assert alto["nivel"] == "alto" and alto["indice"] >= 80
    medio = calcular_indice(**{**base, "telefono_verificado": False, "num_fotos": 1,
                               "reportes_activos": 1})
    assert medio["nivel"] == "medio"
    bajo = calcular_indice(canon_mensual=100, deposito_requerido=5000000,
                             tipo_inmueble="DESCONOCIDO", reglas_convivencia="x",
                             direccion_referencial="y", servicios_ids=[],
                             telefono_verificado=False, num_fotos=0,
                             dias_vigencia=999, reportes_activos=10)
    assert bajo["nivel"] == "basico" and bajo["indice"] < 50
    assert dias_desde(None) == 999
    from datetime import datetime, timezone
    naive = datetime(2026, 1, 1)
    assert dias_desde(naive, ahora=datetime(2026, 1, 11, tzinfo=timezone.utc)) == 10


def test_tiempo_pie_bordes():
    from app.services.haversine import tiempo_pie_min, haversine_km, haversine_m

    assert tiempo_pie_min(None) is None
    assert tiempo_pie_min("no-numero") is None
    assert tiempo_pie_min(0) == 1
    assert tiempo_pie_min(66) == 1
    assert tiempo_pie_min(660) == 13
    assert haversine_km(2.44, -76.60, 2.44, -76.60) == 0.0
    assert haversine_m(2.44, -76.60, 2.44, -76.60) == 0


def test_slugify_y_ciudad_to_out():
    from app.services.ciudades import slugify, ciudad_to_out

    assert slugify("Popayán") == "popayan"
    assert slugify("") == ""
    assert slugify(None) == ""
    assert slugify("  San  Agustín!! ") == "san-agustin"
    out = ciudad_to_out(SimpleNamespace(id=1, nombre="Popayán",
                                        departamento="Cauca", activo=True))
    assert out == {"id": 1, "nombre": "Popayán", "departamento": "Cauca",
                   "slug": "popayan", "activo": True}


def test_tokenizado_bordes_y_sinonimos():
    from app.services.search import (tokenize_query, clean_query_for_fts,
                                     tipo_canonico_para_token, escape_ilike)

    assert tokenize_query(None) == []
    assert tokenize_query("") == []
    assert tokenize_query(123) == []
    assert tokenize_query("con de la y") == []
    assert tokenize_query("a") == []
    # La ó no está en la clase del regex: parte en "habitaci" + "n" (ruido de 1 char).
    assert tokenize_query("habitación habitación amplia") == ["habitaci", "amplia"]
    assert tokenize_query("x " * 200) == []
    muchos = " ".join(f"casa{i}" for i in range(30))
    assert len(tokenize_query(muchos)) == 10
    assert clean_query_for_fts(["a", "b"]) == "a b"
    assert tipo_canonico_para_token("apartamento") == "APARTAESTUDIO"
    assert tipo_canonico_para_token("habitacion") == "HABITACION"
    assert tipo_canonico_para_token("castillo") is None
    assert escape_ilike("100%_a\\b") == "100\\%\\_a\\\\b"


def test_storage_factory_y_cloudinary_sin_red(monkeypatch, tmp_path):
    from fastapi import HTTPException
    from app.core.config import settings as _s
    from app.services import storage as _st

    monkeypatch.setattr(_s, "CLOUDINARY_CLOUD_NAME", "")
    assert isinstance(_st.get_storage_backend(base_url="http://x",
                                              upload_dir=str(tmp_path)), _st.LocalStorageBackend)
    local = _st.LocalStorageBackend(str(tmp_path), "http://x/")
    assert local.save(b"data", "a.jpg", "image/jpeg") == "http://x/uploads/a.jpg"
    with pytest.raises(HTTPException) as e:
        local.save(b"data", "../evil.jpg", "image/jpeg")
    assert e.value.status_code == 400

    be = _st.CloudinaryStorageBackend(cloud_name="c", api_key="k", api_secret="s")
    assert be.name == "cloudinary"
    monkeypatch.setattr(_s, "CLOUDINARY_CLOUD_NAME", "c")
    monkeypatch.setattr(_s, "CLOUDINARY_API_KEY", "k")
    monkeypatch.setattr(_s, "CLOUDINARY_API_SECRET", "s")
    assert isinstance(_st.get_storage_backend(), _st.CloudinaryStorageBackend)

    import cloudinary.uploader as _up
    monkeypatch.setattr(_up, "upload", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("red")))
    with pytest.raises(HTTPException) as e2:
        be.save(b"data", "a.jpg", "image/jpeg")
    assert e2.value.status_code == 502
    monkeypatch.setattr(_up, "upload", lambda *a, **k: {"url": "http://x/a.jpg"})
    assert be.save(b"data", "a.jpg", "image/jpeg") == "http://x/a.jpg"


def test_cloudinary_sin_credenciales_503():
    from fastapi import HTTPException
    from app.services.storage import CloudinaryStorageBackend

    be = CloudinaryStorageBackend(cloud_name="", api_key="", api_secret="")
    with pytest.raises(HTTPException) as e:
        be.save(b"data", "a.jpg", "image/jpeg")
    assert e.value.status_code == 503
