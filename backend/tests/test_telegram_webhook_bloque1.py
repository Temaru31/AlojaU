"""Bloque 1: webhook Telegram /start -> vincula telegram_chat_id.

Causa raíz: vincular-inicio emitía el token pero ningún endpoint consumía
el /start, así que usuarios.telegram_chat_id nunca se escribía y el frontend
siempre mostraba "no se detectó /start".
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
EST = {"Authorization": "Bearer mock-token-estudiante"}


def _inicio_token():
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        r = client.post("/api/auth/telegram/vincular-inicio", headers=EST)
        assert r.status_code == 200
        return r.json()["bot_url"].split("start=")[1]
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def test_webhook_formato_urlsafe_y_longitud():
    token = _inicio_token()
    assert len(token) <= 64
    assert all(c.isalnum() or c in ("_", "-") for c in token)


def test_webhook_start_no_vincula_directo():
    # El /start SOLO registra pendiente (o guía si no hay teléfono guardado);
    # jamás vincula directo. La vinculación exige el contacto nativo.
    token = _inicio_token()
    r = client.post(
        "/api/auth/telegram/webhook",
        json={"message": {"chat": {"id": 123456789, "type": "private"},
                          "from": {"id": 123456789}, "text": f"/start {token}"}},
    )
    assert r.status_code == 200
    assert r.json().get("vinculado") is not True
    assert r.json().get("contacto_requerido") is True or "motivo" in r.json()
    # Segundo /start con el mismo token: quemado o re-pendiente, nunca vincula.
    r2 = client.post(
        "/api/auth/telegram/webhook",
        json={"message": {"chat": {"id": 123456789, "type": "private"},
                          "from": {"id": 123456789}, "text": f"/start {token}"}},
    )
    assert r2.json().get("vinculado") is not True


def test_webhook_ignora_grupos_y_no_start():
    token = _inicio_token()
    r = client.post(
        "/api/auth/telegram/webhook",
        json={"message": {"chat": {"id": -1001, "type": "group"}, "text": f"/start {token}"}},
    )
    assert r.json().get("ignorado") == "no-privado"
    r2 = client.post(
        "/api/auth/telegram/webhook",
        json={"message": {"chat": {"id": 999, "type": "private"}, "text": "hola"}},
    )
    assert r2.json().get("ignorado") == "no-start"


def test_desarmar_acepta_legacy_con_puntos():
    import time
    import secrets as _sec
    from app.routers.auth import _firmar_vinculo, _desarmar_token_vinculo
    # Token legacy simulado con puntos (sig 32) debe seguir parseando.
    import hashlib as _hl
    import hmac as _hm
    from app.core.config import settings as _s
    uid, exp, nonce = 3, int(time.time()) + 300, _sec.token_hex(4)
    sig = _hm.new(_s.SECRET_KEY.encode(), f"{uid}.{exp}.{nonce}".encode(), _hl.sha256).hexdigest()[:32]
    legacy = f"{uid}.{exp}.{nonce}.{sig}"
    assert _desarmar_token_vinculo(legacy) is not None
    # Formato nuevo también.
    nuevo = _firmar_vinculo(uid, exp, nonce)
    assert _desarmar_token_vinculo(nuevo) is not None


def test_webhook_secret_fail_closed_en_prod(monkeypatch):
    from app.core.config import settings as _s
    monkeypatch.setattr(_s, "ENV", "prod", raising=False)
    monkeypatch.setattr(_s, "TELEGRAM_BOT_USERNAME", "BotProd", raising=False)
    monkeypatch.setattr(_s, "TELEGRAM_WEBHOOK_SECRET", "", raising=False)
    r = client.post("/api/auth/telegram/webhook", json={"message": {}})
    assert r.status_code == 503
    assert "WEBHOOK_SECRET" in r.json()["detail"]


def test_webhook_secret_ok_pasa():
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_WEBHOOK_SECRET
    _s.TELEGRAM_WEBHOOK_SECRET = "secreto-test-123"
    try:
        sin = client.post("/api/auth/telegram/webhook", json={"message": {}})
        assert sin.status_code == 401
        con = client.post(
            "/api/auth/telegram/webhook",
            json={"message": {"chat": {"id": 1, "type": "private"}, "text": "hola"}},
            headers={"X-Telegram-Bot-Api-Secret-Token": "secreto-test-123"},
        )
        assert con.status_code == 200
    finally:
        _s.TELEGRAM_WEBHOOK_SECRET = viejo


def test_webhook_throttle_anti_enumeracion():
    from app.services import telegram as _tg
    _tg.clear_throttle_for_tests()
    body = {"message": {"chat": {"id": 5, "type": "private"}, "text": "hola"}}
    ultimo = None
    for _ in range(61):
        ultimo = client.post("/api/auth/telegram/webhook", json=body)
    assert ultimo.status_code == 429
    _tg.clear_throttle_for_tests()


def test_webhook_start_registra_pendiente_en_pg():
    # Tras un /start válido el vínculo queda pendiente (usado=False) con el
    # chat anotado; la quema ocurre al resolver el contacto.
    import asyncio
    token = _inicio_token()
    sep = "_" if "_" in token else "."
    nonce = token.split(sep)[2]
    r = client.post(
        "/api/auth/telegram/webhook",
        json={"message": {"chat": {"id": 444555666, "type": "private"},
                          "from": {"id": 444555666}, "text": f"/start {token}"}},
    )
    assert r.status_code == 200

    async def _fila():
        from app.db.session import AsyncSession
        from app.models import TelegramVinculo
        async with AsyncSession() as db:
            return await db.get(TelegramVinculo, nonce)

    row = asyncio.run(_fila())
    assert row is not None
    if r.json().get("contacto_requerido") is True:
        assert row.usado is False
        assert str(row.chat_id_pendiente) == "444555666"
    else:
        # Sin teléfono verificado el enlace se quema en el /start.
        assert row.usado is True
