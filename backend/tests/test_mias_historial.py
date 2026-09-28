"""GET /mias/historial: trazabilidad agregada del dueño (con título).

- 401 sin token; cada dueño solo ve eventos de SUS avisos.
- Flujo: publicar (CREATED) -> aprobar como admin (APPROVED) aparecen
  con publicacion_id y título; terceros no los ven.
"""
import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
ADM = {"Authorization": "Bearer mock-token-admin"}
ARR = {"Authorization": "Bearer mock-token-arrendador"}
EST = {"Authorization": "Bearer mock-token-estudiante"}
TAG = "HistMias"


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
                "SELECT id FROM publicaciones WHERE titulo LIKE '%HistMias%'")
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
            ids = await conn.fetch(
                "SELECT id FROM usuarios WHERE email LIKE 'test_user_tmp_hm%'")
            for r in ids:
                await conn.execute("DELETE FROM sesiones WHERE usuario_id=$1", r["id"])
                await conn.execute("DELETE FROM usuarios WHERE id=$1", r["id"])
        finally:
            await conn.close()

    try:
        asyncio.run(_del())
    except Exception:
        pass


PUB = {
    "titulo": f"Habitación temporal amplia {TAG}",
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


def test_mias_historial_401_sin_token(limpieza):
    assert client.get("/api/publicaciones/mias/historial").status_code == 401


def test_mias_historial_dueno_ve_sus_eventos(limpieza):
    if not _pg():
        pytest.skip("sin PG real")
    # Usuario temporal verificado (patrón oráculo): el demo EST no pasa
    # el gate de teléfono/email para publicar.
    email = f"test_user_tmp_hm{uuid.uuid4().hex[:8]}@alojau.com"
    assert client.post("/api/auth/register", json={
        "email": email, "password": "HistMias1!x", "nombre_completo": "Temporal Historial",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            u.email_verificado = True
            u.telefono_verificado = True
            await db.commit()
    asyncio.run(_ver())
    tok = client.post("/api/auth/login",
                      json={"email": email, "password": "HistMias1!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    PUB["titulo"] = f"Habitación temporal amplia {TAG} {uuid.uuid4().hex[:6]}"
    r_pub = client.post("/api/publicaciones", json=PUB, headers=h)
    assert r_pub.status_code == 201, r_pub.text
    pid = r_pub.json()["id"]
    try:
        r = client.get("/api/publicaciones/mias/historial", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["items"], list) and isinstance(d["total"], int)
        mios = [i for i in d["items"] if i["publicacion_id"] == pid]
        assert any(i["evento"] == "CREATED" and TAG in (i["titulo"] or "") for i in mios)
        # Tras aprobar como admin aparece APPROVED con título.
        assert client.patch(f"/api/admin/publicaciones/{pid}",
                            json={"estado": "ACTIVO"}, headers=ADM).status_code == 200
        d2 = client.get("/api/publicaciones/mias/historial", headers=h).json()
        mios2 = [i for i in d2["items"] if i["publicacion_id"] == pid]
        assert any(i["evento"] == "APPROVED" for i in mios2)
        # Aislamiento: otro dueño no ve estos eventos.
        d3 = client.get("/api/publicaciones/mias/historial", headers=ARR).json()
        assert all(i["publicacion_id"] != pid for i in d3["items"])
    finally:
        try:
            client.delete(f"/api/publicaciones/{pid}", headers=h)
        except Exception:
            pass
