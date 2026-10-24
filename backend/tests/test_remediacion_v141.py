"""v14.1 remediación — revocación central, fail-closed, throttle OTP,
filtro soft-delete en lecturas y migración 010.
Auto-limpieza: prefijo test_user_tmp_* + purga PG/mocks en teardown.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
TMP_PREFIX = "test_user_tmp_"


def tmp_email(tag=""):
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


PUB = {
    "titulo": "Habitación temporal amplia remediación v141",
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


@pytest.fixture()
def limpieza():
    creados = []
    yield creados
    for e in list(creados):
        auth_router.MOCK_USERS.pop(e, None)
        auth_router._MOCK_OTPS.pop(f"{e}:email_verify", None)
        auth_router._MOCK_RESETS.pop(e, None)
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._PW_ATTEMPTS.clear()
    auth_router._OTP_SOLICITAR.clear()
    auth_router._OTP_VERIFICAR.clear()
    try:
        import asyncio
        import os

        async def _del():
            import asyncpg
            raw = os.getenv("DATABASE_URL",
                            "postgresql://alojau:alojau123@localhost:5432/alojau")
            dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
            if "supabase.co" in dsn.lower():
                return
            try:
                conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=5)
            except Exception:
                return
            try:
                pubs = await conn.fetch(
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%remediación v141%'")
                for r in pubs:
                    await conn.execute(
                        "DELETE FROM publicaciones_audit WHERE publicacion_id=$1", r["id"])
                    await conn.execute(
                        "DELETE FROM imagenes_publicacion WHERE publicacion_id=$1", r["id"])
                    await conn.execute(
                        "DELETE FROM publicacion_servicios WHERE publicacion_id=$1", r["id"])
                    await conn.execute(
                        "DELETE FROM publicacion_campus WHERE publicacion_id=$1", r["id"])
                    await conn.execute(
                        "DELETE FROM publicaciones WHERE id=$1", r["id"])
                ids = await conn.fetch(
                    "SELECT id FROM usuarios WHERE email LIKE 'test_user_tmp_%'")
                for r in ids:
                    await conn.execute("DELETE FROM sesiones WHERE usuario_id=$1", r["id"])
                    await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
            finally:
                await conn.close()

        asyncio.run(_del())
    except Exception:
        pass


def _registrar(email, pw="Remedial1!x"):
    return client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Remedial",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True})


def _verificar_email_db(email):
    import asyncio

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u is None:
                raise RuntimeError("sin PG real")
            u.email_verificado = True
            await db.commit()
    asyncio.run(_ver())


# 1. Revocación central: tras revocar, TODOS los endpoints 401.
def test_revocacion_central_todos_401(limpieza):
    email = tmp_email("rev")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Remedial1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/auth/perfil", headers=h).status_code == 200
    assert client.get("/api/publicaciones/mias", headers=h).status_code == 200
    assert client.post("/api/auth/sesiones/revocar-todas", headers=h).status_code == 200
    for metodo, url, kwargs in [
        ("get", "/api/auth/perfil", {}),
        ("get", "/api/publicaciones/mias", {}),
        ("patch", "/api/auth/perfil", {"json": {"nombre_completo": "X Troyano"}}),
        ("post", "/api/publicaciones", {"json": PUB}),
        ("get", "/api/auth/sesiones", {}),
    ]:
        r = getattr(client, metodo)(url, headers=h, **kwargs)
        assert r.status_code == 401, (metodo, url, r.status_code)


# 2. Fail-closed: sin PG en prod simulado -> 503 ruidoso (no noop).
def test_fail_closed_rate_check_503(limpieza, monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from app.core import config as cfg_mod

    class _Dead:
        async def execute(self, *a, **k):
            raise RuntimeError("PG caído (test)")
        async def rollback(self):
            return None

    # Dev/mock: permite con warning.
    asyncio.run(auth_router._db_rate_check(_Dead(), "k:test", limite=5, ventana_s=60))
    # Prod simulado: 503.
    monkeypatch.setattr(cfg_mod.settings, "ENV", "prod", raising=False)
    monkeypatch.setattr(cfg_mod.settings, "USE_MOCK_FALLBACK", False, raising=False)
    monkeypatch.setenv("ENV", "prod")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_router._db_rate_check(_Dead(), "k:test", limite=5, ventana_s=60))
    assert exc.value.status_code == 503


# 3. Throttle OTP: solicitar 6° -> 429; verificar 11° -> 429.
def test_otp_throttle_429(limpieza):
    email = tmp_email("throt")
    limpieza.append(email)
    codes = [client.post("/api/auth/otp/solicitar",
                         json={"email": email, "proposito": "email_verify"}).status_code
             for _ in range(6)]
    assert codes[:5] == [202] * 5, codes
    assert codes[5] == 429, codes

    email2 = tmp_email("throtv")
    limpieza.append(email2)
    assert client.post("/api/auth/otp/solicitar",
                       json={"email": email2, "proposito": "email_verify"}).status_code == 202
    vcodes = [client.post("/api/auth/otp/verificar",
                          json={"email": email2, "codigo": "000001",
                                "proposito": "email_verify"}).status_code
              for _ in range(11)]
    assert vcodes[:10] == [401] * 10, vcodes
    assert vcodes[10] == 429, vcodes


# 4. Soft-delete invisible en lectura pública, visible para admin.
def test_softdelete_fuera_de_lecturas(limpieza):
    email = tmp_email("sdel")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    try:
        _verificar_email_db(email)
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "Remedial1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    adm = {"Authorization": "Bearer mock-token-admin"}
    assert client.patch(f"/api/admin/publicaciones/{pid}",
                        json={"estado": "ACTIVO"}, headers=adm).status_code == 200
    antes = client.get("/api/publicaciones", params={"size": 50}).json()
    assert pid in [p["id"] for p in antes["items"]]
    # Soft-delete de la cuenta.
    assert client.request("DELETE", "/api/auth/cuenta",
                          json={"confirm_email": email, "password": "Remedial1!x"},
                          headers=h).status_code == 200
    despues = client.get("/api/publicaciones", params={"size": 50}).json()
    assert pid not in [p["id"] for p in despues["items"]]
    assert client.get(f"/api/publicaciones/{pid}").status_code == 404
    assert client.get(f"/api/publicaciones/{pid}", headers=adm).status_code == 200


# 5. Migración 010: FKs con acción + cadena + espejo + schema alineado.
def test_migracion_010_fk_y_cadena():
    import pathlib
    repo = pathlib.Path(__file__).resolve().parent.parent
    mig = (repo / "alembic" / "versions" / "010_fk_cascade_and_sequences.py").read_text()
    sql = (repo / "db" / "migrations" / "010_fk_cascade_and_sequences.sql").read_text()
    schema = (repo / "db" / "schema.sql").read_text()
    assert "009_profile_jsonb_preferences" in mig  # down_revision
    for constr in ("publicaciones_usuario_id_fkey",
                   "reportes_publicacion_usuario_id_fkey",
                   "publicaciones_audit_usuario_id_fkey"):
        assert constr in mig and constr in sql
    assert "REFERENCES usuarios(id) ON DELETE CASCADE" in schema
    assert "REFERENCES usuarios(id) ON DELETE SET NULL" in schema

    import asyncio

    async def _check():
        import asyncpg, os
        raw = os.getenv("DATABASE_URL",
                        "postgresql://alojau:alojau123@localhost:5432/alojau")
        dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
        try:
            conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=5)
        except Exception:
            pytest.skip("sin PG real")
            return
        try:
            rows = await conn.fetch(
                "SELECT conname, confdeltype FROM pg_constraint "
                "WHERE conname IN ('publicaciones_usuario_id_fkey',"
                "'reportes_publicacion_usuario_id_fkey',"
                "'publicaciones_audit_usuario_id_fkey',"
                "'zonas_barrios_ciudad_id_fkey')")
            got = {r["conname"]: bytes(r["confdeltype"]).decode()
                     if isinstance(r["confdeltype"], (bytes, bytearray)) else r["confdeltype"]
                     for r in rows}
            assert got.get("publicaciones_usuario_id_fkey") == "c", got
            assert got.get("reportes_publicacion_usuario_id_fkey") == "n", got
            assert got.get("publicaciones_audit_usuario_id_fkey") == "n", got
            assert got.get("zonas_barrios_ciudad_id_fkey") == "c", got
        finally:
            await conn.close()
    asyncio.run(_check())
