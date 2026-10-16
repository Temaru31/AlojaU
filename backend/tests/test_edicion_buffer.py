"""M4 edición bufferizada: PATCH /{id}/fotos atómico + servicios_ids en PATCH.

El frontend acumula altas/bajas/reorden/portada en estado local y commitea
aquí: un solo request reconcilia todo en 1 transacción (sin N llamadas
sueltas a /upload/orden, DELETE y /vincular).
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
    "titulo": "Habitación temporal amplia edición buffer",
    "descripcion": "Descripción con más de veinte caracteres para el test buffer",
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
    # Aislamiento anti rate-limit entre archivos (límite 5 logins/min por IP).
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
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%edición buffer%'")
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


def _usuario_verificado(limpieza, tag, pw="Buffer1!x"):
    import asyncio
    email = tmp_email(tag)
    limpieza.append(email)
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Buffer",
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


def _crear(limpieza, tag="buf"):
    _, h = _usuario_verificado(limpieza, tag)
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    return pid, h


def test_fotos_reconcilia_todo_en_un_request(limpieza):
    pid, h = _crear(limpieza)
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert [im["orden"] for im in det["imagenes"]] == [1, 2, 3]
    u1, u2, u3 = [im["url"] for im in det["imagenes"]]
    nueva = "https://a.com/nueva.jpg"
    # Portada=u3, quita u1, agrega nueva: 1 request, 1 transacción.
    r = client.patch(f"/api/publicaciones/{pid}/fotos",
                     json={"fotos": [u3, u2, nueva]}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fotos"] == [u3, u2, nueva]
    assert [im["orden"] for im in body["imagenes"]] == [1, 2, 3]
    assert body["total"] == 3
    det2 = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert det2["fotos"][0] == u3
    assert [im["orden"] for im in det2["imagenes"]] == [1, 2, 3]


def test_fotos_validaciones_422(limpieza):
    pid, h = _crear(limpieza, "bufv")
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    u1 = det["imagenes"][0]["url"]
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": []}, headers=h).status_code == 422
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": [u1, u1]}, headers=h).status_code == 422
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": ["ftp://x/y.jpg"]}, headers=h).status_code == 422
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": [u1] * 11}, headers=h).status_code == 422


def test_fotos_403_ajeno_y_404(limpieza):
    pid, h = _crear(limpieza, "bufa")
    _, h2 = _usuario_verificado(limpieza, "bufb")
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    u1 = det["imagenes"][0]["url"]
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": [u1]}, headers=h2).status_code == 403
    assert client.patch("/api/publicaciones/999999/fotos",
                        json={"fotos": [u1]}, headers=h).status_code == 404
    assert client.patch(f"/api/publicaciones/{pid}/fotos",
                        json={"fotos": [u1]}).status_code == 401


def test_editar_un_solo_patch_con_todo(limpieza):
    """M4 commit único: escalares + etiquetas + fotos en UN request."""
    pid, h = _crear(limpieza, "bufu")
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    u1, u2, u3 = [im["url"] for im in det["imagenes"]]
    r = client.patch(f"/api/publicaciones/{pid}", json={
        "titulo": "Habitación temporal amplia edición buffer total",
        "servicios_ids": [2, 5],
        "fotos": [u3, u1, "https://a.com/nueva2.jpg"],
    }, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["titulo"] == "Habitación temporal amplia edición buffer total"
    assert sorted(body["servicios_ids"]) == [2, 5]
    det2 = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert det2["fotos"] == [u3, u1, "https://a.com/nueva2.jpg"]
    assert [im["orden"] for im in det2["imagenes"]] == [1, 2, 3]
    assert det2["fotos"][0] == det2["imagenes"][0]["url"]


def test_mias_orden_vistas_y_estado(limpieza):
    """M6: ?orden= ordena server-side (válido con paginación multipágina)."""
    pid, h = _crear(limpieza, "bufo")
    pid2 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    client.patch(f"/api/admin/publicaciones/{pid}", json={"estado": "ACTIVO"}, headers=ADM)
    client.patch(f"/api/admin/publicaciones/{pid2}", json={"estado": "ACTIVO"}, headers=ADM)
    client.post(f"/api/publicaciones/{pid2}/vista")
    r = client.get("/api/publicaciones/mias", params={"orden": "vistas", "size": 50}, headers=h)
    assert r.status_code == 200, r.text
    ids = [p["id"] for p in r.json()["items"]]
    assert ids.index(pid2) < ids.index(pid)
    r2 = client.get("/api/publicaciones/mias", params={"orden": "estado", "size": 50}, headers=h)
    assert r2.status_code == 200, r2.text
    assert client.get("/api/publicaciones/mias", params={"orden": "invalido"},
                      headers=h).status_code == 422


def test_editar_servicios_ids_reemplaza(limpieza):
    pid, h = _crear(limpieza, "bufs")
    r = client.patch(f"/api/publicaciones/{pid}", json={"servicios_ids": [1, 4]}, headers=h)
    assert r.status_code == 200, r.text
    assert sorted(r.json()["servicios_ids"]) == [1, 4]
    # Servicio inexistente -> 404 sin tocar nada.
    assert client.patch(f"/api/publicaciones/{pid}",
                        json={"servicios_ids": [1, 9999]}, headers=h).status_code == 404
    r2 = client.patch(f"/api/publicaciones/{pid}", json={"titulo": "Habitación temporal amplia edición buffer x"}, headers=h)
    assert r2.status_code == 200
    assert sorted(r2.json()["servicios_ids"]) == [1, 4]
