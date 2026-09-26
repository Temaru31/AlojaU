"""M2.1 anti-oráculo en reportes + M4 historial (settings/cuenta/aviso).

- POST /reportes responde el MISMO 404 para inexistente, PENDIENTE y
  PAUSADO: no se puede sondear avisos privados.
- PATCH settings y DELETE cuenta dejan fila de auditoría (mig 012).
- GET /{id}/historial: solo dueño (tercero 403, anónimo 401).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
TMP_PREFIX = "test_user_tmp_"
ADM = {"Authorization": "Bearer mock-token-admin"}


def tmp_email(tag=""):
    return f"{TMP_PREFIX}{tag}{uuid.uuid4().hex[:8]}@alojau.com"


PUB = {
    "titulo": "Habitación temporal amplia oráculo historial",
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
    auth_router._LOGIN_ATTEMPTS.clear()
    yield creados
    auth_router._LOGIN_ATTEMPTS.clear()
    for e in list(creados):
        auth_router.MOCK_USERS.pop(e, None)
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
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%oráculo historial%'")
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
                        "DELETE FROM vistas_dedup WHERE publicacion_id=$1", r["id"])
                    await conn.execute(
                        "DELETE FROM publicaciones WHERE id=$1", r["id"])
                await conn.execute(
                    "DELETE FROM publicaciones_audit WHERE evento IN ('SETTINGS','CUENTA_DELETE') "
                    "AND detalle LIKE '%test_user_tmp_%'")
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


def _usuario_verificado(limpieza, tag, pw="Oraculo1!x"):
    import asyncio
    email = tmp_email(tag)
    limpieza.append(email)
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Oraculo",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

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
    try:
        asyncio.run(_ver())
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def _reportar(pid):
    return client.post("/api/reportes", json={
        "publicacion_id": pid, "motivo": "OTRO", "detalle": "Test oráculo con detalle largo"})


def test_oraculo_mismo_404(limpieza):
    _, h = _usuario_verificado(limpieza, "ora")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    # PENDIENTE (recién creada) e inexistente: MISMO 404 y MISMO mensaje.
    r_priv = _reportar(pid)
    r_nada = _reportar(999999)
    assert r_priv.status_code == 404
    assert (r_priv.status_code, r_priv.json()) == (r_nada.status_code, r_nada.json())
    # PAUSADO también 404.
    client.patch(f"/api/admin/publicaciones/{pid}", json={"estado": "ACTIVO"}, headers=ADM)
    client.patch(f"/api/publicaciones/{pid}/estado", json={"estado": "PAUSADO"}, headers=h)
    r_pau = _reportar(pid)
    assert (r_pau.status_code, r_pau.json()) == (r_nada.status_code, r_nada.json())
    # ACTIVO sí acepta (201): el canal legítimo sigue abierto.
    client.patch(f"/api/publicaciones/{pid}/estado", json={"estado": "ACTIVO"}, headers=h)
    assert _reportar(pid).status_code == 201


def test_settings_deja_auditoria(limpieza):
    _usuario_verificado(limpieza, "ors")
    r = client.patch("/api/admin/automation/settings/dias_vigencia_publicacion",
                     json={"valor": "30"}, headers=ADM)
    assert r.status_code == 200, r.text
    aud = client.get("/api/admin/auditoria", params={"evento": "SETTINGS"}, headers=ADM).json()
    assert any("dias_vigencia_publicacion" in (a["detalle"] or "") for a in aud["items"])
    assert any(a["publicacion_id"] is None for a in aud["items"])


def test_cuenta_delete_deja_auditoria(limpieza):
    email, h = _usuario_verificado(limpieza, "orc", "Oraculo1!x")
    # Sin password (provider password) -> 403 y sin auditoría.
    assert client.request("DELETE", "/api/auth/cuenta",
                          json={"confirm_email": email}, headers=h).status_code == 403
    r = client.request("DELETE", "/api/auth/cuenta",
                       json={"confirm_email": email, "password": "Oraculo1!x"}, headers=h)
    assert r.status_code == 200, r.text
    aud = client.get("/api/admin/auditoria", params={"evento": "CUENTA_DELETE"}, headers=ADM).json()
    assert any(a["publicacion_id"] is None for a in aud["items"])


def test_historial_solo_dueno(limpieza):
    _, h = _usuario_verificado(limpieza, "orh")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    r = client.get(f"/api/publicaciones/{pid}/historial", headers=h)
    assert r.status_code == 200, r.text
    assert any(i["evento"] == "CREATED" for i in r.json()["items"])
    _, h2 = _usuario_verificado(limpieza, "orh2")
    assert client.get(f"/api/publicaciones/{pid}/historial", headers=h2).status_code == 403
    assert client.get(f"/api/publicaciones/{pid}/historial").status_code == 401
    assert client.get("/api/publicaciones/999999/historial", headers=h).status_code == 404
