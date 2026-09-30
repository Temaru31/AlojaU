"""Verificación telefónica gratuita vía Telegram (rama fix/telegram-free-verification).

1. Token en BD con expiración 10 min; uno nuevo anula los previos.
2. Contacto nativo coincidente verifica+vincula; distinto rechaza con XXXX.
3. Teléfono o chat ya usados por otra cuenta activa -> "duplicado".
4. Normalización con/sin código de país (caso real 573126516881).
Requiere PG real (tabla telegram_vinculos); si no, skip.
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


def _dsn():
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    from app.db.session import dsn_asyncpg_a_psycopg
    return dsn_asyncpg_a_psycopg(raw)


def _pg():
    return "supabase.co" not in _dsn().lower()


@pytest.fixture()
def limpieza():
    auth_router._TELEGRAM_VINCULOS.clear()
    auth_router._TELEGRAM_PENDIENTES.clear()
    yield
    auth_router._TELEGRAM_VINCULOS.clear()
    auth_router._TELEGRAM_PENDIENTES.clear()


def _registrar(tag, telefono=None):
    from conftest import generar_password_prueba
    pw = generar_password_prueba()
    # Minúsculas: el backend normaliza el email al guardar (_norm_email).
    email = f"test_user_tmp_tg{tag}{uuid.uuid4().hex[:6]}@alojau.com".lower()
    body = {"email": email, "password": pw, "nombre_completo": "Temporal Telegram",
            "acepto_tratamiento_datos": True}
    if telefono is not None:
        body["telefono_whatsapp"] = telefono
    assert client.post("/api/auth/register", json=body).status_code == 200

    async def _flags():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            u.email_verificado = True
            await db.commit()
    asyncio.run(_flags())
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": pw}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def _inicio(h):
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        r = client.post("/api/auth/telegram/vincular-inicio", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["expira_segundos"] == 600
        return r.json()["bot_url"].split("start=")[1]
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def _nonce_de(token):
    sep = "_" if "_" in token else "."
    return token.split(sep)[2]


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


def _texto(chat, texto):
    return client.post("/api/auth/telegram/webhook", json={
        "message": {"chat": {"id": chat, "type": "private"},
                    "from": {"id": chat}, "text": texto}})


class Enviados:
    def __init__(self):
        self.llamadas = []

    async def __call__(self, *a, **k):
        self.llamadas.append((a, k))
        return True

    def textos(self):
        return [a[2] if len(a) > 2 else k.get("texto", "") for a, k in self.llamadas]


def _fila_vinculo(nonce):
    async def _go():
        from app.db.session import AsyncSession
        from app.models import TelegramVinculo
        async with AsyncSession() as db:
            return await db.get(TelegramVinculo, nonce)
    return asyncio.run(_go())


def test_token_expira_10min_y_nuevo_anula_previo(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("exp1", telefono="573209991001")
    t1 = _inicio(h)
    t2 = _inicio(h)
    n1, n2 = _nonce_de(t1), _nonce_de(t2)
    assert _fila_vinculo(n1).usado is True  # anulado por el nuevo
    fila2 = _fila_vinculo(n2)
    assert fila2.usado is False
    delta = fila2.expira_en
    if getattr(delta, "tzinfo", None) is None:
        delta = delta.replace(tzinfo=datetime.timezone.utc)
    import datetime
    segundos = (delta - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
    assert 540 < segundos <= 600

    # Expirado en BD -> /start responde expirado/inválido.
    async def _vencer():
        from app.db.session import AsyncSession
        from app.models import TelegramVinculo
        import datetime as _dt
        async with AsyncSession() as db:
            row = await db.get(TelegramVinculo, n2)
            row.expira_en = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(seconds=1)
            await db.commit()
    asyncio.run(_vencer())
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _start(777888999, t2)
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "token-invalido"
    assert any("expirado o es inválido" in t for t in envi.textos())


def test_contacto_coincidente_verifica_sin_sms(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("ok1", telefono="573126516881")
    assert client.get("/api/auth/perfil", headers=h).json()["telefono_verificado"] is False
    token = _inicio(h)
    assert _start(111222333, token).json().get("contacto_requerido") is True
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        # Formato crudo de Telegram, sin 57: igual verifica.
        r = _contacto(111222333, "3126516881")
    assert r.json().get("vinculado") is True
    perfil = client.get("/api/auth/perfil", headers=h).json()
    assert perfil.get("telegram_vinculado") is True
    assert perfil.get("telefono_verificado") is True
    assert any("verificado con éxito" in t for t in envi.textos())


def test_contacto_distinto_muestra_ultimos_4(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("no1", telefono="573126516881")
    token = _inicio(h)
    assert _start(222333444, token).json().get("contacto_requerido") is True
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _contacto(222333444, "+573009998877")
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "numero-distinto"
    assert any("8877" in t for t in envi.textos())
    assert client.get("/api/auth/perfil", headers=h).json().get("telefono_verificado") is False


def test_telefono_ya_usado_por_otra_cuenta_rechaza(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, ha = _registrar("dupa", telefono="573209991111")
    ta = _inicio(ha)
    assert _start(333444555, ta).json().get("contacto_requerido") is True
    assert _contacto(333444555, "+573209991111").json().get("vinculado") is True

    _, hb = _registrar("dupb", telefono="573209991111")
    tb = _inicio(hb)
    assert _start(444555666, tb).json().get("contacto_requerido") is True
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _contacto(444555666, "3209991111")
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "duplicado"
    assert any("ya está en uso" in t for t in envi.textos())
    perfil_b = client.get("/api/auth/perfil", headers=hb).json()
    assert perfil_b.get("telegram_vinculado") is False
    assert perfil_b.get("telefono_verificado") is False


def test_mismo_chat_en_otra_cuenta_rechaza(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, ha = _registrar("cha", telefono="573209991222")
    ta = _inicio(ha)
    assert _start(555666777, ta).json().get("contacto_requerido") is True
    assert _contacto(555666777, "+573209991222").json().get("vinculado") is True

    _, hb = _registrar("chb", telefono="573209992333")
    tb = _inicio(hb)
    # B usa EL MISMO chat de Telegram que A (mismo aparato/otra cuenta).
    assert _start(555666777, tb).json().get("contacto_requerido") is True
    r = _contacto(555666777, "+573209992333")
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "duplicado"


def _desvincular(h):
    return client.post("/api/auth/telegram/desvincular", json={}, headers=h)


def test_desvincular_libera_numero_para_otra_cuenta(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, ha = _registrar("liba", telefono="573209993111")
    ta = _inicio(ha)
    assert _start(888999111, ta).json().get("contacto_requerido") is True
    assert _contacto(888999111, "+573209993111").json().get("vinculado") is True
    assert client.get("/api/auth/perfil", headers=ha).json().get("telefono_verificado") is True

    r = _desvincular(ha)
    assert r.status_code == 200
    assert r.json().get("desvinculado") is True
    pa = client.get("/api/auth/perfil", headers=ha).json()
    assert pa.get("telegram_vinculado") is False
    assert pa.get("telefono_verificado") is False
    assert pa.get("telefono_whatsapp") in (None, "")

    # Idempotente: repetir no falla.
    assert _desvincular(ha).status_code == 200

    # Otra cuenta reclama el mismo número sin trabas.
    _, hb = _registrar("libb", telefono="573209993111")
    tb = _inicio(hb)
    assert _start(999111222, tb).json().get("contacto_requerido") is True
    assert _contacto(999111222, "+573209993111").json().get("vinculado") is True
    assert client.get("/api/auth/perfil", headers=hb).json().get("telefono_verificado") is True


def test_desvincular_quema_pendientes(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("libq", telefono="573209993222")
    token = _inicio(h)
    assert _desvincular(h).status_code == 200
    r = _start(111222333, token)
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "token-invalido"


def test_desvincular_sin_auth_401():
    r = client.post("/api/auth/telegram/desvincular", json={})
    assert r.status_code == 401


def _enlace(h):
    return client.get("/api/auth/telegram/enlace", headers=h)


def _contar_vinculos(email):
    async def _go():
        import asyncpg
        conn = await asyncpg.connect(
            "postgresql://alojau:alojau123@localhost:5432/alojau")
        try:
            return await conn.fetchval(
                """SELECT count(*) FROM telegram_vinculos v
                   JOIN usuarios u ON u.id = v.usuario_id
                   WHERE u.email = $1 AND v.usado IS FALSE""", email)
        finally:
            await conn.close()
    return asyncio.run(_go())


def test_enlace_sin_telefono_422(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("en0")
    r = _enlace(h)
    assert r.status_code == 422
    assert "WhatsApp" in r.json()["detail"]


def test_enlace_reutiliza_sin_acuñar(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    email, h = _registrar("en1", telefono="573209994111")
    r1 = _enlace(h)
    assert r1.status_code == 200, r1.text
    assert r1.json()["bot_url"].startswith("https://t.me/")
    assert r1.json()["expira_segundos"] <= 600
    n1 = _contar_vinculos(email)
    r2 = _enlace(h)
    assert r2.status_code == 200
    assert r2.json()["bot_url"] == r1.json()["bot_url"]  # mismo enlace
    assert _contar_vinculos(email) == n1  # sin filas nuevas


def test_enlace_nuevo_tras_expirar(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    _, h = _registrar("en2", telefono="573209994222")
    viejo = _enlace(h).json()["bot_url"]

    async def _vencer():
        from app.db.session import AsyncSession
        from app.models import TelegramVinculo
        import datetime as _dt
        async with AsyncSession() as db:
            res = await db.execute(select_vinculos())
            for row in res.scalars().all():
                row.expira_en = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(seconds=1)
            await db.commit()

    def select_vinculos():
        from sqlalchemy import select as _sel
        from app.models import TelegramVinculo
        return _sel(TelegramVinculo)
    asyncio.run(_vencer())
    nuevo = _enlace(h).json()["bot_url"]
    assert nuevo.startswith("https://t.me/")
    assert nuevo != viejo


def test_enlace_sin_bot_503(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    from app.core.config import settings as _s
    _, h = _registrar("en3", telefono="573209994333")
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = ""
    try:
        r = _enlace(h)
        assert r.status_code == 503
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def test_enlace_sin_auth_401():
    assert client.get("/api/auth/telegram/enlace").status_code == 401


def test_numero_escrito_a_mano_se_rechaza_con_guia(limpieza):
    envi = Enviados()
    with patch("app.services.telegram.send_message", envi):
        r = _texto(666777888, "3126516881")
    assert r.json().get("vinculado") is False
    assert r.json().get("motivo") == "texto-ignorado"
    assert any("no acepto números escritos" in t for t in envi.textos())
    # Charla normal sin dígitos: silencio (no-start), sin spam.
    r2 = _texto(666777888, "hola bot")
    assert r2.json().get("ignorado") == "no-start"
