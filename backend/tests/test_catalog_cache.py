"""Caché HIT de catálogos (campus/ciudades/zonas): MISS, HIT, clear_*.

Funciona con PG y en mock (el payload cacheado da igual): primera llamada MISS,
segunda HIT con el mismo cuerpo. Cubre _cache_get/HIT y los helpers clear_*,
diseñados para tests e ingesta.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.routers import campus as campus_mod
from app.routers import ciudades as ciudades_mod
from app.routers import zonas as zonas_mod

client = TestClient(app)


def _miss_luego_hit(path, clear):
    clear()
    r1 = client.get(path)
    assert r1.status_code == 200, r1.text
    assert r1.headers.get("X-Cache") == "MISS"
    r2 = client.get(path)
    assert r2.status_code == 200
    assert r2.headers.get("X-Cache") == "HIT"
    assert r2.json() == r1.json()


def test_campus_cache_miss_hit_y_clear():
    _miss_luego_hit("/api/campus", campus_mod.clear_campus_cache)


def test_ciudades_cache_miss_hit_y_clear():
    _miss_luego_hit("/api/ciudades", ciudades_mod.clear_ciudades_cache)


def test_zonas_cache_miss_hit_y_clear():
    _miss_luego_hit("/api/zonas", zonas_mod.clear_zonas_cache)
