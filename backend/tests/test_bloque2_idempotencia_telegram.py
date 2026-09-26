"""Bloque 2: idempotencia de POST publicaciones + Telegram persistente.

- Misma clave + usuario dos veces -> mismo id, una sola fila.
- Clave distinta -> dos avisos. Clave malformada -> 422. Sin clave -> 201.
- Telegram: inicio persiste fila; validar_token_vinculo_db consume una sola
  vez (doble consumo y expirado -> None); memoria intacta para HMAC.
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.db.session import AsyncSession

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}


def _payload():
    return {
        "titulo": "Habitación temporal idempotente amplia",
        "descripcion": "Descripción con más de veinte caracteres para el test",
        "tipo_inmueble": "HABITACION_INDEPENDIENTE",
        "canon_mensual": 450000,
        "deposito_requerido": 0,
        "zona_barrio_id": 1,
        "direccion_referencial": "Calle temporal 123 referencia",
        "reglas_convivencia": "Reglas temporales válidas 10+",
        "servicios_ids": [1],
        "campus_ids": [],
        "fotos": ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
    }


def _mias_total():
    r = client.get("/api/publicaciones/mias", params={"size": 1}, headers=ARR)
    assert r.status_code == 200, r.text
    return r.json()["total"]


def test_idem_misma_clave_un_solo_aviso():
    antes = _mias_total()
    clave = f"b2-{uuid.uuid4().hex[:16]}"
    h = {**ARR, "Idempotency-Key": clave}
    r1 = client.post("/api/publicaciones", json=_payload(), headers=h)
    assert r1.status_code == 201, r1.text
    r2 = client.post("/api/publicaciones", json=_payload(), headers=h)
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    assert r1.json() == r2.json()
    assert _mias_total() == antes + 1


def test_idem_clave_distinta_crea_otro_y_malformada_422():
    clave_a = f"b2-{uuid.uuid4().hex[:16]}"
    clave_b = f"b2-{uuid.uuid4().hex[:16]}"
    a = client.post("/api/publicaciones", json=_payload(),
                    headers={**ARR, "Idempotency-Key": clave_a})
    b = client.post("/api/publicaciones", json=_payload(),
                    headers={**ARR, "Idempotency-Key": clave_b})
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] != b.json()["id"]
    mala = client.post("/api/publicaciones", json=_payload(),
                       headers={**ARR, "Idempotency-Key": "!!!"})
    assert mala.status_code == 422
    sin_clave = client.post("/api/publicaciones", json=_payload(), headers=ARR)
    assert sin_clave.status_code == 201


def _corre(coro):
    return asyncio.run(coro)


def test_telegram_pg_escribe_y_consume_una_vez():
    from app.core.config import settings as _s
    from app.routers import auth as a
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        r = client.post("/api/auth/telegram/vincular-inicio", headers=ARR)
        assert r.status_code == 200, r.text
        token = r.json()["bot_url"].split("start=")[1]

        async def _flujo():
            from app.models import TelegramVinculo
            async with AsyncSession() as db:
                # Fila persistida en PG al generar.
                nonce = token.split(".")[2]
                row = await db.get(TelegramVinculo, nonce)
                assert row is not None and row.usado is False
                # Primer consumo OK (vía PG, con row-lock).
                uid = await a.validar_token_vinculo_db(db, token)
                assert isinstance(uid, int)
                # Segundo consumo -> None (un solo uso real).
                assert await a.validar_token_vinculo_db(db, token) is None
                return uid

        assert isinstance(_corre(_flujo()), int)
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo


def test_telegram_db_expirado_y_desconocido_none():
    from app.routers import auth as a

    async def _casos():
        from app.models import TelegramVinculo
        async with AsyncSession() as db:
            # Nonce jamás emitido -> None.
            falso = await a.validar_token_vinculo_db(
                db, "1.9999999999.deadbeef.ffffffffffffffffffffffffffffffff")
            assert falso is None
            # Expirado en PG -> None.
            db.add(TelegramVinculo(
                nonce="b2expirado123456", usuario_id=1,
                expira_en=datetime.now(timezone.utc) - timedelta(seconds=10),
                usado=False,
            ))
            await db.commit()
            bueno = f"1.{int((datetime.now(timezone.utc) + timedelta(seconds=300)).timestamp())}.b2expirado123456"
            import hashlib as _hl
            import hmac as _hm
            from app.core.config import settings as _s
            sig = _hm.new(_s.SECRET_KEY.encode(), bueno.encode(), _hl.sha256).hexdigest()[:32]
            assert await a.validar_token_vinculo_db(db, f"{bueno}.{sig}") is None
            await db.execute(
                TelegramVinculo.__table__.delete().where(
                    TelegramVinculo.nonce == "b2expirado123456"))
            await db.commit()

    _corre(_casos())


def test_telegram_memoria_sigue_intacta_para_hmac():
    # El camino sync en memoria no se rompió con la refactorización.
    from app.routers import auth as a
    import time
    import secrets
    exp = int(time.time()) + 300
    nonce = secrets.token_hex(8)
    tok = a._firmar_vinculo(1, exp, nonce)
    a._TELEGRAM_VINCULOS[nonce] = {"user_id": 1, "exp": exp, "usado": False}
    try:
        assert a.validar_token_vinculo(tok) == 1
        assert a.validar_token_vinculo(tok) is None
    finally:
        a._TELEGRAM_VINCULOS.pop(nonce, None)
        a._TELEGRAM_USADOS.discard(nonce)
