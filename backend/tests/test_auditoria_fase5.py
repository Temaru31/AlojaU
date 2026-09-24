"""FASE 5 auditoría (2026-09-24): unificación de límites reglas 2000.

Verifica el ciclo completo: payload con reglas de 1500 chars (válido en el
frontend LIMITES.reglas.max=2000) ya no es tumbado por la API con 422.
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


PUB_BASE = {
    "titulo": "Habitación temporal amplia reglas unificadas",
    "descripcion": "Descripción con más de veinte caracteres para el test reglas",
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
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%reglas unificadas%'")
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


def _usuario_verificado(limpieza, tag, pw="Reglas1!x"):
    email = tmp_email(tag)
    limpieza.append(email)
    assert client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal Reglas",
        "telefono_whatsapp": "573001234567", "acepto_tratamiento_datos": True}).status_code == 200

    async def _ver():
        import asyncio as _a  # noqa
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
    import asyncio
    try:
        asyncio.run(_ver())
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_reglas_1500_chars_pasa_201(limpieza):
    h = _usuario_verificado(limpieza, "rg")
    payload = dict(PUB_BASE, reglas_convivencia="Norma de convivencia. " * 75)  # ~1725 chars
    assert 1000 < len(payload["reglas_convivencia"]) <= 2000
    r = client.post("/api/publicaciones", json=payload, headers=h)
    assert r.status_code == 201, r.text


def test_reglas_mas_de_2000_da_422(limpieza):
    h = _usuario_verificado(limpieza, "rg2")
    payload = dict(PUB_BASE, reglas_convivencia="x" * 2001)
    r = client.post("/api/publicaciones", json=payload, headers=h)
    assert r.status_code == 422, r.text


def test_reglas_1500_con_html_da_422_ambas_mejoras_coexisten(limpieza):
    """Consolidación merge ramaDavid: reglas largas Y sin HTML a la vez.

    1500 chars pasan (límite 2000 nuestro) pero con <script> se rechazan
    (bloqueo HTML de David). Prueba la zona exacta del conflicto resuelto.
    """
    h = _usuario_verificado(limpieza, "rgx")
    payload = dict(PUB_BASE, reglas_convivencia=("Norma válida. " * 100) + "<script>alert(1)</script>")
    assert 1000 < len(payload["reglas_convivencia"]) <= 2000
    r = client.post("/api/publicaciones", json=payload, headers=h)
    assert r.status_code == 422, r.text


def test_editar_reglas_1500_pasa(limpieza):
    h = _usuario_verificado(limpieza, "rg3")
    creo = client.post("/api/publicaciones", json=dict(
        PUB_BASE, reglas_convivencia="Reglas temporales válidas 10+"), headers=h)
    assert creo.status_code == 201, creo.text
    pid = creo.json()["id"]
    r = client.patch(f"/api/publicaciones/{pid}",
                     json={"reglas_convivencia": "Nueva norma. " * 100}, headers=h)
    assert r.status_code == 200, r.text
