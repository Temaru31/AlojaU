"""Bloque 1: throttle avatar/telegram + limpieza de huérfanos + storage helper.

Aislado por usuario fresco (uuid) para no ensuciar cuotas de otros tests
(los dicts en memoria viven todo el proceso pytest).
"""
import io
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cuotas_limpias():
    """El reseed reinicia identities: cada test registra al mismo uid y
    compartiría cuota en memoria. Se aísla como el resto de la suite.
    También barre archivos avatar-* que el test deje en disco local."""
    from app.routers import auth as _a
    _a._AVATAR_MEM.clear()
    _a._TG_MEM.clear()
    yield
    _a._AVATAR_MEM.clear()
    _a._TG_MEM.clear()
    try:
        for n in os.listdir(UPLOADS):
            if n.startswith("avatar-"):
                try:
                    os.remove(os.path.join(UPLOADS, n))
                except OSError:
                    pass
    except OSError:
        pass


PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
       b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")

UPLOADS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))


def _nuevo_token():
    email = f"b1_{uuid.uuid4().hex[:8]}@alojau.com"
    r = client.post("/api/auth/register", json={
        "email": email, "password": "Fuerte1!x", "nombre_completo": "Bloque Uno",
        "acepto_tratamiento_datos": True,
    })
    assert r.status_code in (200, 201), r.text
    t = client.post("/api/auth/login", json={"email": email, "password": "Fuerte1!x"})
    assert t.status_code == 200, t.text
    return {"Authorization": f"Bearer {t.json()['access_token']}"}


def _archivo_local(url):
    assert "/uploads/" in url, f"test exige backend local, fue: {url}"
    return os.path.join(UPLOADS, os.path.basename(url))


def test_avatar_invalido_400_antes_de_contar_cuota():
    h = _nuevo_token()
    r = client.post("/api/auth/avatar",
                    files={"file": ("a.txt", io.BytesIO(b"hola"), "text/plain")}, headers=h)
    assert r.status_code == 400
    # Sigue con cuota intacta: 10 válidos pasan.
    for _ in range(10):
        ok = client.post("/api/auth/avatar",
                         files={"file": ("a.png", io.BytesIO(PNG), "image/png")}, headers=h)
        assert ok.status_code == 200, ok.text


def test_avatar_11_peticion_429():
    h = _nuevo_token()
    for _ in range(10):
        r = client.post("/api/auth/avatar",
                        files={"file": ("a.png", io.BytesIO(PNG), "image/png")}, headers=h)
        assert r.status_code == 200, r.text
    exceso = client.post("/api/auth/avatar",
                         files={"file": ("a.png", io.BytesIO(PNG), "image/png")}, headers=h)
    assert exceso.status_code == 429


def test_avatar_reemplazo_y_borrado_limpian_disco():
    h = _nuevo_token()
    r1 = client.post("/api/auth/avatar",
                     files={"file": ("a.png", io.BytesIO(PNG), "image/png")}, headers=h)
    assert r1.status_code == 200
    f1 = _archivo_local(r1.json()["foto_perfil_url"])
    assert os.path.isfile(f1)
    r2 = client.post("/api/auth/avatar",
                     files={"file": ("b.png", io.BytesIO(PNG), "image/png")}, headers=h)
    assert r2.status_code == 200
    f2 = _archivo_local(r2.json()["foto_perfil_url"])
    assert os.path.isfile(f2)
    # El reemplazo borró el anterior (sin huérfanos).
    assert not os.path.exists(f1)
    d = client.delete("/api/auth/avatar", headers=h)
    assert d.status_code == 200
    assert d.json()["foto_perfil_url"] is None
    # Quitar también borra el archivo.
    assert not os.path.exists(f2)


def test_vincular_throttle_5_mas_1_429():
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        h = _nuevo_token()
        for _ in range(5):
            r = client.post("/api/auth/telegram/vincular-inicio", headers=h)
            assert r.status_code == 200, r.text
            assert r.json()["bot_url"].startswith("https://t.me/AlojaU_test_bot?start=")
        exceso = client.post("/api/auth/telegram/vincular-inicio", headers=h)
        assert exceso.status_code == 429
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def test_borrar_local_si_huerfano():
    from app.services.storage import borrar_local_si_huerfano as _del
    # Externas y vacías: nunca toca nada.
    assert _del(None) is False
    assert _del("https://res.cloudinary.com/x/avatar-abc.jpg") is False
    assert _del("http://localhost:8000/uploads/otro-abc.jpg") is False
    # Traversal bloqueado.
    assert _del("http://localhost:8000/uploads/../app/main.py") is False
    # Inexistente: False sin lanzar.
    assert _del("http://localhost:8000/uploads/avatar-noexiste.jpg") is False
    # Real: crea, borra, confirma.
    nombre = "avatar-test-huerfano.jpg"
    dest = os.path.join(UPLOADS, nombre)
    os.makedirs(UPLOADS, exist_ok=True)
    with open(dest, "wb") as f:
        f.write(b"x")
    assert _del(f"http://localhost:8000/uploads/{nombre}") is True
    assert not os.path.exists(dest)
