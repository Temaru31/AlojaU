"""Ramas de error de CloudinaryStorageBackend.save (sin red).

El backend real se prueba con un módulo `cloudinary` falso en sys.modules
(la lib real sí está instalada, pero así no sale a red). Sin DB: corre en
PG y en mock. No duplica test_f3_cloudinary.py (ese mockea save completo;
aquí se ejercita el cuerpo real).
"""
import sys
import types

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services.storage import CloudinaryStorageBackend


def _fake_cloudinary(upload=None, exc=None):
    mod = types.ModuleType("cloudinary")
    up = types.ModuleType("cloudinary.uploader")

    def upload_fn(content, **kw):
        if exc is not None:
            raise exc
        return upload

    up.upload = upload_fn
    mod.uploader = up
    mod.config = lambda **kw: None
    return mod


def _instalar_fake(monkeypatch, upload=None, exc=None):
    fake = _fake_cloudinary(upload=upload, exc=exc)
    monkeypatch.setitem(sys.modules, "cloudinary", fake)
    monkeypatch.setitem(sys.modules, "cloudinary.uploader", fake.uploader)


def test_cloudinary_save_ok_retorna_secure_url(monkeypatch):
    _instalar_fake(monkeypatch, upload={"secure_url": "https://res.cloudinary.com/demo/a.jpg"})
    b = CloudinaryStorageBackend(cloud_name="demo", api_key="k", api_secret="s")
    assert b.save(b"x", "a.jpg", "image/jpeg") == "https://res.cloudinary.com/demo/a.jpg"


def test_cloudinary_sin_credenciales_503(monkeypatch):
    _instalar_fake(monkeypatch, upload={"secure_url": "https://x/y.jpg"})
    monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "")
    monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "")
    monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "")
    b = CloudinaryStorageBackend(cloud_name="", api_key="", api_secret="")
    with pytest.raises(HTTPException) as ei:
        b.save(b"x", "a.jpg", "image/jpeg")
    assert ei.value.status_code == 503


def test_cloudinary_fallo_subida_502(monkeypatch):
    _instalar_fake(monkeypatch, exc=RuntimeError("corte de red"))
    b = CloudinaryStorageBackend(cloud_name="demo", api_key="k", api_secret="s")
    with pytest.raises(HTTPException) as ei:
        b.save(b"x", "a.jpg", "image/jpeg")
    assert ei.value.status_code == 502


def test_cloudinary_sin_url_502(monkeypatch):
    _instalar_fake(monkeypatch, upload={})
    b = CloudinaryStorageBackend(cloud_name="demo", api_key="k", api_secret="s")
    with pytest.raises(HTTPException) as ei:
        b.save(b"x", "a.jpg", "image/jpeg")
    assert ei.value.status_code == 502
