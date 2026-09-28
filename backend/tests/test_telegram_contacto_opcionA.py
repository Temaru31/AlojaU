"""Opción A: /start registra pendiente; solo el contacto con el número
verificado vincula. Sin teléfono verificado no hay flujo ciego.
"""
import asyncio
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
ADM = {"Authorization": "Bearer mock-token-admin"}
PHONE = "573009991234"


def _dsn():
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    return raw.replace("postgresql+asyncpg://", "postgresql://")


def _pg():
    return "supabase.co" not in _dsn().lower()


@pytest.fixture()
def limpieza():
    auth_router._LOGIN_ATTEMPTS.clear()
    yield
    auth_router._LOGIN_ATTEMPTS.clear()
    if not _pg():
        return

    async def _del():
        import asyncpg
        try:
            conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=5)
        except Exception:
            return
        try:
            pubs = await conn.fetch(
                "SELECT id FROM publicaciones WHERE titulo LIKE '%TgContactoA%'")
            for r in pubs:
                for tabla in ("publicaciones_audit", "imagenes_publicacion",
                              "publicacion_servicios", "publicacion_campus",
                              "vistas_dedup"):
                    try:
                        await conn.execute(
                            f"DELETE FROM {tabla} WHERE publicacion_id=$1", r["id"])
                    except Exception:
                        pass
                await conn.execute("DELETE FROM publicaciones WHERE id=$1", r["id"])
            # telegram_vinculos lo restaura el reseed de conftest (TRUNCATE +
            # seed por test); aquí solo pubs y usuarios temporales.
            ids = await conn.fetch(
                "SELECT id FROM usuarios WHERE email LIKE 'test_user_tmp_ct%'")
            for r in ids:
                await conn.execute("DELETE FROM sesiones WHERE usuario_id=$1", r["id"])
                await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
        finally:
            await conn.close()

    try:
        asyncio.run(_del())
    except Exception:
        pass


def _usuario_limpio(limpieza, tag, *, telefono=PHONE, verificado=True):
    """Registra usuario temporal con teléfono controlado. Retorna (email, headers)."""
    email = f"test_user_tmp_ct{tag}{uuid.uuid4().hex[:6]}@alojau.com"
    assert client.post("/api/auth/register", json={
        "email": email, "password": "ContactoA1!x", "nombre_completo": "Temporal Contacto",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

    async def _flags():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            u.email_verificado = True
            u.telefono_whatsapp = telefono
            u.telefono_verificado = verificado
            await db.commit()
    asyncio.run(_flags())
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "ContactoA1!x"}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def _vincular_inicio(h):
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        r = client.post("/api/auth/telegram/vincular-inicio", headers=h)
        assert r.status_code == 200, r.text
        return r.json()["bot_url"].split("start=")[1]
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def _start(chat, token):
    return client.post("/api/auth/telegram/webhook", json={
        "message": {"chat": {"id": chat, "type": "private"},
                    "from": {"id": chat}, "text": f"/start {token}"}})


def _contacto(chat, phone, contact_uid=None):
    return client.post("/api/auth/telegram/webhook", json={
        "message": {"chat": {"id": chat, "type": "private"},
                    "from": {"id": chat},
                    "contact": {"phone_number": phone,
                                "user_id": contact_uid if contact_uid is not None else chat,
                                "first_name": "Temp"}}})

class Enviados:
    """Registra llamadas a telegram.send_message (bot API simulada)."""

    def __init__(self):
        self.llamadas = []

    async def __call__(self, *a, **k):
        self.llamadas.append((a, k))
        return True

    def textos(self):
        return [a[2] if len(a) > 2 else k.get("texto", "") for a, k in self.llamadas]

    def markups(self):
        return [k.get("reply_markup") or (a[4] if len(a) > 4 else None)
                for a, k in self.llamadas]


def test_start_pide_contacto_y_no_vincula(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _usuario_limpio(limpieza, "a")
    token = _vincular_inicio(h)
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _start(111222333, token)
    assert r.status_code == 200
    assert r.json().get("contacto_requerido") is True
    assert r.json().get("vinculado") is False
    # El bot pidió el contacto con teclado nativo.
    assert any((m or {}).get("keyboard", [{}])[0][0].get("request_contact") is True
               for m in envi.markups() if m)
    # Aún NO vinculado (el /start solo no basta).
    tok = h["Authorization"].split()[1]
    perfil = client.get("/api/auth/perfil", headers=h).json()
    assert perfil.get("telegram_vinculado") is False


def test_start_sin_telefono_verificado_bloquea(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _usuario_limpio(limpieza, "b", telefono=None, verificado=False)
    token = _vincular_inicio(h)
    r = _start(222333444, token)
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "no-phone-verificado"
    assert r.json().get("contacto_requerido") is not True
    # El enlace quedó quemado (un solo uso): ni el contacto posterior sirve.
    r2 = _contacto(222333444, "+573009991234")
    assert r2.json().get("vinculado") is not True


def test_contacto_valido_vincula_y_quita_teclado(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _usuario_limpio(limpieza, "c")
    token = _vincular_inicio(h)
    assert _start(333444555, token).json().get("contacto_requerido") is True
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _contacto(333444555, "+573009991234")
    assert r.json().get("vinculado") is True
    assert any((m or {}).get("remove_keyboard") is True for m in envi.markups() if m)
    assert client.get("/api/auth/perfil", headers=h).json().get("telegram_vinculado") is True
    # Segundo contacto con el mismo pendiente: ya quemado.
    r2 = _contacto(333444555, "+573009991234")
    assert r2.json().get("vinculado") is not True


def test_contacto_numero_distinto_rechaza_y_quema(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _usuario_limpio(limpieza, "d")
    token = _vincular_inicio(h)
    assert _start(444555666, token).json().get("contacto_requerido") is True
    # Atacante comparte SU propio contacto (user_id consistente) pero el
    # número no es el verificado: se rechaza y se quema el pendiente.
    r = _contacto(444555666, "+573009998877")
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "numero-distinto"
    assert client.get("/api/auth/perfil", headers=h).json().get("telegram_vinculado") is False
    # Reintento posterior: ya no hay pendiente.
    r2 = _contacto(444555666, "+573009991234")
    assert r2.json().get("vinculado") is not True
    assert r2.json().get("motivo") == "sin-solicitud"


def test_contacto_ajeno_rechaza_sin_quemar(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _usuario_limpio(limpieza, "e")
    token = _vincular_inicio(h)
    assert _start(555666777, token).json().get("contacto_requerido") is True
    # Contacto reenviado de otra persona (user_id distinto al que escribe).
    r = _contacto(555666777, "+573009991234", contact_uid=999888777)
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "contacto-ajeno"
    # El pendiente legítimo sigue vivo: el dueño sí puede vincular después.
    r2 = _contacto(555666777, "+573009991234")
    assert r2.json().get("vinculado") is True


def test_contacto_sin_start_previo_se_ignora(limpieza):
    r = _contacto(666777888, "+573009991234")
    assert r.json().get("vinculado") is not True
    assert r.json().get("motivo") == "sin-solicitud"


def test_normalizacion_coincide_formatos():
    from app.routers.auth import _contacto_coincide
    assert _contacto_coincide("+573009991234", "573009991234", True) is True
    assert _contacto_coincide("+57 300 999 1234", "573009991234", True) is True
    assert _contacto_coincide("3009991234", "573009991234", True) is True
    assert _contacto_coincide("+573009991234", "573009991234", False) is False
    assert _contacto_coincide("+573009998877", "573009991234", True) is False
    assert _contacto_coincide("basura", "573009991234", True) is False
    assert _contacto_coincide("+573009991234", None, True) is False
