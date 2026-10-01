"""Rediseño campanita: eventos de moderación + bienvenida Telegram.

- Aprobar/rechazar (unitario y bulk) crea fila 'moderacion' al dueño.
- Vincular Telegram crea fila 'telegram' de bienvenida.
- Helper roto (FK inexistente) retorna None sin lanzar.
- Migración 020 encadena y el CHECK acepta 'telegram'.
Requiere PG real; si no, skip.
"""
import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1
ADMIN = {"Authorization": "Bearer mock-token-admin"}  # id 2

PUB_NUEVO = {
    "titulo": "Apartaestudio cerca al campus universitario",
    "descripcion": "Aviso de prueba para blindaje: ambiente iluminado y tranquilo.",
    "tipo_inmueble": "APARTAESTUDIO",
    "canon_mensual": 500000,
    "zona_barrio_id": 1,
    "direccion_referencial": "Calle 5 # 10-20, Popayán",
    "reglas_convivencia": "No fumar, no mascotas grandes, visitas con aviso.",
    "servicios_ids": [1],
    "campus_ids": [],
    "fotos": ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
}


def _dsn():
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    from app.db.session import dsn_asyncpg_a_psycopg
    return dsn_asyncpg_a_psycopg(raw)


def _pg():
    return "supabase.co" not in _dsn().lower()


async def _sql(sql, *args):
    import asyncpg
    conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
    try:
        if args:
            return await conn.fetch(sql, *args)
        return await conn.execute(sql)
    finally:
        await conn.close()


@pytest.fixture()
def limpias():
    if not _pg():
        pytest.skip("sin PG real")
    asyncio.run(_asegurar_020())
    asyncio.run(_sql("TRUNCATE notificaciones, busquedas_guardadas"))
    yield
    asyncio.run(_sql("TRUNCATE notificaciones, busquedas_guardadas"))


async def _asegurar_020():
    """Asegura tablas 019 + CHECK 020 en la BD de dev (independiente del
    orden de ejecución: el espejo 019 es idempotente; el ADD CONSTRAINT se
    verifica antes en el catálogo)."""
    import asyncpg
    import pathlib
    mirror = pathlib.Path(__file__).resolve().parent.parent / "db" / "migrations" \
        / "019_notificaciones_y_busquedas.sql"
    texto = mirror.read_text(encoding="utf-8").split("-- DOWNGRADE")[0]
    stmts = []
    for chunk in texto.split(";"):
        stmt = "\n".join(ln for ln in chunk.splitlines()
                         if ln.strip() and not ln.strip().startswith("--")).strip()
        if stmt:
            stmts.append(stmt)
    conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
    try:
        for s in stmts:
            await conn.execute(s)
        definicion = await conn.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conname='chk_notif_tipo'")
        if definicion is None or "'telegram'" not in definicion:
            await conn.execute(
                "ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notif_tipo")
            await conn.execute(
                "ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS "
                "notificaciones_tipo_check")
            await conn.execute(
                "ALTER TABLE notificaciones ADD CONSTRAINT chk_notif_tipo "
                "CHECK (tipo IN ('nuevo_arriendo','moderacion','vencimiento','telegram'))")
    finally:
        await conn.close()


def _tipos_de(uid):
    async def _go():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            rows = await conn.fetch(
                "SELECT tipo, evento_id FROM notificaciones WHERE usuario_id=$1", uid)
            return [(r["tipo"], r["evento_id"]) for r in rows]
        finally:
            await conn.close()
    return asyncio.run(_go())


def _publicar():
    r = client.post("/api/publicaciones", json=dict(PUB_NUEVO), headers=ARR)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_aprobar_crea_moderacion_al_dueno(limpias):
    pid = _publicar()
    assert client.patch(f"/api/admin/publicaciones/{pid}",
                        json={"estado": "ACTIVO"}, headers=ADMIN).status_code == 200
    filas = _tipos_de(1)
    assert any(t == "moderacion" and e == f"moderacion:{pid}:ACTIVO" for t, e in filas)


def test_rechazar_crea_moderacion(limpias):
    pid = _publicar()
    assert client.patch(f"/api/admin/publicaciones/{pid}",
                        json={"estado": "RECHAZADO"}, headers=ADMIN).status_code == 200
    filas = _tipos_de(1)
    assert any(t == "moderacion" and e == f"moderacion:{pid}:RECHAZADO" for t, e in filas)


def test_bulk_approve_notifica_cada_aviso(limpias):
    p1, p2 = _publicar(), _publicar()
    r = client.post("/api/admin/publicaciones/bulk-approve",
                    json={"ids": [p1, p2]}, headers=ADMIN)
    assert r.status_code == 200, r.text
    eventos = [e for _, e in _tipos_de(1)]
    assert f"moderacion:{p1}:ACTIVO" in eventos
    assert f"moderacion:{p2}:ACTIVO" in eventos


def test_vincular_telegram_crea_bienvenida(limpias):
    from conftest import generar_password_prueba
    pw = generar_password_prueba()
    email = f"test_user_tmp_tgev{uuid.uuid4().hex[:6]}@alojau.com".lower()
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Eventos",
        "telefono_whatsapp": "573209995111", "acepto_tratamiento_datos": True}).status_code == 200

    async def _flags():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalars().first()
            u.email_verificado = True
            await db.commit()
            return u.id
    uid = asyncio.run(_flags())
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": pw}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        token = client.post("/api/auth/telegram/vincular-inicio", headers=h).json()["bot_url"].split("start=")[1]
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo
    chat = 777888111
    assert client.post("/api/auth/telegram/webhook", json={
        "message": {"chat": {"id": chat, "type": "private"},
                    "from": {"id": chat}, "text": f"/start {token}"}}).json().get("contacto_requerido") is True
    r = client.post("/api/auth/telegram/webhook", json={
        "message": {"chat": {"id": chat, "type": "private"},
                    "from": {"id": chat},
                    "contact": {"phone_number": "+573209995111", "user_id": chat, "first_name": "T"}}})
    assert r.json().get("vinculado") is True
    filas = _tipos_de(uid)
    assert any(t == "telegram" for t, _ in filas)


def test_helper_roto_retorna_none_sin_lanzar(limpias):
    from app.services import notifications_matcher as nm

    async def _go():
        from app.db.session import AsyncSession
        async with AsyncSession() as db:
            # usuario_id inexistente -> FK violation dentro del savepoint.
            assert await nm.crear_notificacion(
                db, usuario_id=999999999, tipo="moderacion",
                titulo="t", evento_id="x:1") is None
            assert await nm.notificar_moderacion(
                db, usuario_id=999999999, publicacion_id=1,
                titulo_pub="t", estado="ACTIVO") is None
    asyncio.run(_go())


def test_migracion_020_tipo_telegram_ok():
    import pathlib
    repo = pathlib.Path(__file__).resolve().parent.parent
    mig = (repo / "alembic" / "versions" / "020_notificacion_telegram.py").read_text(encoding="utf-8")
    assert "019_notificaciones_y_busquedas" in mig
    assert "'telegram'" in mig
    sql = (repo / "db" / "migrations" / "020_notificacion_telegram.sql").read_text(encoding="utf-8")
    assert "chk_notif_tipo" in sql and "'telegram'" in sql
    assert "telegram" in (repo / "db" / "schema.sql").read_text(encoding="utf-8")
    modelos = (repo / "app" / "models" / "__init__.py").read_text(encoding="utf-8")
    assert "'telegram'" in modelos
