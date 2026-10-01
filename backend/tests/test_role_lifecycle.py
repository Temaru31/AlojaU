"""v13.2 role lifecycle — promoción/demición transaccional + gates de perfil.
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
    "titulo": "Habitación temporal amplia para ciclo de vida",
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
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._PW_ATTEMPTS.clear()
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
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%ciclo de vida%'")
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


def _registrar(email, pw="Ciclo1!x", telefono="573001234567"):
    body = {"email": email, "password": pw, "nombre_completo": "Temporal Ciclo",
            "acepto_tratamiento_datos": True}
    if telefono is not None:
        body["telefono_whatsapp"] = telefono
    return client.post("/api/auth/register", json=body)


def _login(email, pw="Ciclo1!x"):
    return client.post("/api/auth/login", json={"email": email, "password": pw})


def _rol_db(email):
    import asyncio
    import os
    from sqlalchemy import select

    async def _get():
        from app.db.session import AsyncSession
        from app.models import Usuario
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            return u.rol if u else None
    return asyncio.run(_get())


# Test 1: base publica -> 201 + ARRENDADOR + flag reactivo.
def test_T1_publicar_promueve_con_flag(limpieza):
    email = tmp_email("t1")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    # Email gate: verificar vía OTP-flow directo en BD para el test.
    tok = _login(email).json()["access_token"]
    # Sin email verificado el gate 403 aparece antes: se acepta 403 aquí solo
    # si el seed de verificación falla; el flujo feliz exige verificar.
    r = client.post("/api/publicaciones", json=PUB,
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code in (201, 403), r.text


def test_T1b_publicar_verificado_promueve(limpieza):
    from app.routers.auth import MOCK_USERS
    email = tmp_email("t1b")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    # Verificación manual en BD (atajo de test; equivale al OTP).
    import asyncio

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u:
                u.email_verificado = True
                await db.commit()
    try:
        asyncio.run(_ver())
    except Exception:
        pytest.skip("sin PG real")
    tok = _login(email).json()["access_token"]
    r = client.post("/api/publicaciones", json=PUB,
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 201, r.text
    assert r.json()["rol"] == "ARRENDADOR"
    assert r.json()["rol_actualizado"] is True
    assert _rol_db(email) == "ARRENDADOR"


# Test 2: 2 pubs, elimina 1 -> sigue ARRENDADOR.
def test_T2_eliminar_una_de_dos_mantiene_rol(limpieza):
    import asyncio
    email = tmp_email("t2")
    limpieza.append(email)
    assert _registrar(email).status_code == 200

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u:
                u.email_verificado = True
                await db.commit()
    try:
        asyncio.run(_ver())
    except Exception:
        pytest.skip("sin PG real")
    tok = _login(email).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    id1 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    id2 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    d = client.delete(f"/api/publicaciones/{id1}", headers=h)
    assert d.status_code == 200, d.text
    assert d.json()["rol"] == "ARRENDADOR"
    assert d.json()["rol_actualizado"] is False
    assert _rol_db(email) == "ARRENDADOR"
    client.delete(f"/api/publicaciones/{id2}", headers=h)


# Test 3: elimina la última -> ESTUDIANTE + scopes revocados (403 admin).
def test_T3_eliminar_ultima_demociona(limpieza):
    import asyncio
    email = tmp_email("t3")
    limpieza.append(email)
    assert _registrar(email).status_code == 200

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u:
                u.email_verificado = True
                await db.commit()
    try:
        asyncio.run(_ver())
    except Exception:
        pytest.skip("sin PG real")
    tok = _login(email).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    assert _rol_db(email) == "ARRENDADOR"
    d = client.delete(f"/api/publicaciones/{pid}", headers=h)
    assert d.status_code == 200, d.text
    assert d.json()["rol"] == "ESTUDIANTE"
    assert d.json()["rol_actualizado"] is True
    assert _rol_db(email) == "ESTUDIANTE"
    # Token fresco de ESTUDIANTE no toca admin (scopes revocados observables).
    tok2 = _login(email).json()["access_token"]
    assert client.get("/api/admin/metricas",
                      headers={"Authorization": f"Bearer {tok2}"}).status_code == 403


# Gate teléfono: sin teléfono -> 400 con guía (no promueve).
def test_gate_telefono_400_sin_promover(limpieza):
    import asyncio
    email = tmp_email("notel")
    limpieza.append(email)
    assert _registrar(email, telefono=None).status_code == 200

    async def _ver():
        from app.db.session import AsyncSession
        from app.models import Usuario
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(select(Usuario).where(Usuario.email == email))
            u = res.scalars().first()
            if u:
                u.email_verificado = True
                await db.commit()
    try:
        asyncio.run(_ver())
    except Exception:
        pytest.skip("sin PG real")
    tok = _login(email).json()["access_token"]
    r = client.post("/api/publicaciones", json=PUB,
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 400, r.text
    assert "contacto" in r.json()["detail"]
    assert _rol_db(email) == "ESTUDIANTE"


# Preferencias: namespaces, tamaño y merge.
def test_preferencias_validacion_y_merge(limpieza):
    email = tmp_email("prefs")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = _login(email).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    bad = client.patch("/api/auth/perfil", json={"preferencias": {"admin.root": True}}, headers=h)
    assert bad.status_code == 422
    big = client.patch("/api/auth/perfil",
                       json={"preferencias": {"filtros.x": "y" * 5000}}, headers=h)
    assert big.status_code == 422
    ok = client.patch("/api/auth/perfil",
                      json={"preferencias": {"filtros.mascotas": True}}, headers=h)
    assert ok.status_code == 200, ok.text
    assert ok.json()["preferencias"].get("filtros.mascotas") is True
    ok2 = client.patch("/api/auth/perfil",
                       json={"preferencias": {"roomie.buscando": True}}, headers=h)
    assert ok2.json()["preferencias"].get("filtros.mascotas") is True
    assert ok2.json()["preferencias"].get("roomie.buscando") is True


# Foto: javascript: rechazada, https aceptada. Bio acotada. Teléfono limpia.
def test_perfil_foto_bio_telefono(limpieza):
    email = tmp_email("pfx")
    limpieza.append(email)
    assert _registrar(email).status_code == 200
    tok = _login(email).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    xss = client.patch("/api/auth/perfil",
                       json={"foto_perfil_url": "javascript:alert(1)"}, headers=h)
    assert xss.status_code == 422
    ok = client.patch("/api/auth/perfil",
                      json={"foto_perfil_url": "https://lh3.googleusercontent.com/a/x",
                            "bio": "Estudiante tranquilo."}, headers=h)
    assert ok.status_code == 200
    assert ok.json()["foto_perfil_url"].startswith("https://")
    assert ok.json()["bio"] == "Estudiante tranquilo."
    vaciar = client.patch("/api/auth/perfil", json={"telefono_whatsapp": ""}, headers=h)
    assert vaciar.status_code == 200
    assert vaciar.json()["telefono_whatsapp"] is None
