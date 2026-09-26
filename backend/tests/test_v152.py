"""v15.2 — estado dueño, similares, vistas, multimedia, bulk, auditoría,
automoderación y settings. Auto-limpieza tmp + purga PG/mocks.
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
    "titulo": "Habitación temporal amplia v152 marketplace",
    "descripcion": "Descripción con más de veinte caracteres para el test v152",
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
                    "SELECT id FROM publicaciones WHERE titulo LIKE '%v152 marketplace%'")
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


def _registrar(email, pw="V152test1!x"):
    return client.post("/api/auth/register", json={
        "email": email, "password": pw, "nombre_completo": "Temporal V152",
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


def _usuario_verificado(limpieza, tag, pw="V152test1!x"):
    email = tmp_email(tag)
    limpieza.append(email)
    assert _registrar(email, pw).status_code == 200
    try:
        _verificar_email_db(email)
    except RuntimeError:
        pytest.skip("sin PG real")
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


ADM = {"Authorization": "Bearer mock-token-admin"}


# --- Switch ACTIVO<->PAUSADO del dueño ----------------------------------------
def test_estado_switch_dueno(limpieza):
    email, h = _usuario_verificado(limpieza, "est")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    client.patch(f"/api/admin/publicaciones/{pid}", json={"estado": "ACTIVO"}, headers=ADM)
    # Solo dueño (otro usuario -> 403).
    email2, h2 = _usuario_verificado(limpieza, "est2")
    assert client.patch(f"/api/publicaciones/{pid}/estado",
                        json={"estado": "PAUSADO"}, headers=h2).status_code == 403
    # Valor inválido -> 422.
    assert client.patch(f"/api/publicaciones/{pid}/estado",
                        json={"estado": "EXPIRADO"}, headers=h).status_code == 422
    r = client.patch(f"/api/publicaciones/{pid}/estado",
                     json={"estado": "PAUSADO"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "PAUSADO"
    r2 = client.patch(f"/api/publicaciones/{pid}/estado",
                      json={"estado": "ACTIVO"}, headers=h)
    assert r2.json()["estado"] == "ACTIVO"
    # Desde PENDIENTE no se puede (eludiría moderación) -> 409.
    pid2 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    assert client.patch(f"/api/publicaciones/{pid2}/estado",
                        json={"estado": "ACTIVO"}, headers=h).status_code == 409


# --- Similares -----------------------------------------------------------------
def test_similares_misma_zona(limpieza):
    email, h = _usuario_verificado(limpieza, "sim")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    pid2 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    r = client.get(f"/api/publicaciones/{pid}/similares")
    assert r.status_code == 200, r.text
    assert pid not in [p["id"] for p in r.json()["items"]]
    assert client.get("/api/publicaciones/999999/similares").status_code == 404


# --- Vistas: dedup + throttle ---------------------------------------------------
def test_vistas_dedup_y_throttle(limpieza):
    email, h = _usuario_verificado(limpieza, "vis")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    r1 = client.post(f"/api/publicaciones/{pid}/vista")
    assert r1.status_code == 200, r1.text
    assert r1.json()["contada"] is True
    assert r1.json()["vistas"] == 1
    r2 = client.post(f"/api/publicaciones/{pid}/vista")
    assert r2.json()["contada"] is False
    assert r2.json()["vistas"] == 1
    assert client.post("/api/publicaciones/999999/vista").status_code == 404


# --- Multimedia: borrar + reordenar --------------------------------------------
def test_fotos_borrar_y_reordenar(limpieza):
    email, h = _usuario_verificado(limpieza, "fot")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert len(det["imagenes"]) == 3
    assert det["imagenes"][0]["orden"] == 1
    # Otro usuario no puede borrar -> 403.
    _, h2 = _usuario_verificado(limpieza, "fot2")
    assert client.delete(f"/api/publicaciones/upload/{det['imagenes'][0]['id']}",
                         headers=h2).status_code == 403
    # Portada = última foto.
    ids = [im["id"] for im in det["imagenes"]]
    ro = client.patch("/api/publicaciones/upload/orden",
                      json={"publicacion_id": pid, "orden_ids": ids[::-1]}, headers=h)
    assert ro.status_code == 200, ro.text
    assert ro.json()["portada_id"] == ids[-1]
    det2 = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert [im["id"] for im in det2["imagenes"]] == ids[::-1]
    # orden_ids incompleto -> 422.
    assert client.patch("/api/publicaciones/upload/orden",
                        json={"publicacion_id": pid, "orden_ids": ids[:2]},
                        headers=h).status_code == 422
    # Borrar una foto compacta el orden.
    d = client.delete(f"/api/publicaciones/upload/{ids[0]}", headers=h)
    assert d.status_code == 200, d.text
    assert d.json()["fotos_restantes"] == 2
    assert client.delete("/api/publicaciones/upload/999999", headers=h).status_code == 404


# --- Bulk + auditoría ------------------------------------------------------------
def test_bulk_y_auditoria(limpieza):
    email, h = _usuario_verificado(limpieza, "blk")
    pid1 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    pid2 = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    r = client.post("/api/admin/publicaciones/bulk-approve",
                    json={"ids": [pid1, pid2, 999999]}, headers=ADM)
    assert r.status_code == 200, r.text
    assert set(r.json()["cambiados"]) == {pid1, pid2}
    assert r.json()["no_encontrados"] == [999999]
    assert client.post("/api/admin/publicaciones/bulk-approve",
                       json={"ids": []}, headers=ADM).status_code == 422
    assert client.post("/api/admin/publicaciones/bulk-reject",
                       json={"ids": [pid1]}, headers=h).status_code == 403
    aud = client.get("/api/admin/auditoria",
                     params={"publicacion_id": pid1}, headers=ADM)
    assert aud.status_code == 200
    assert any(a["evento"] == "APPROVED" for a in aud.json()["items"])


# --- Auto-moderación: OFF no-op, unidad de reglas ---------------------------------
def test_automod_off_noop_y_reglas():
    from app.services import auto_moderation as am
    cfg = am._cfg_valores(None)
    assert cfg["moderacion_automatica"] == "false"
    assert am.validar_texto("Habitación amplia cerca al campus con buena luz",
                            "Descripción suficientemente larga y coherente para pasar",
                            cfg) == []
    assert any("palabras_prohibidas" in m for m in am.validar_texto(
        "Habitación casino x1000!!!", "Descripción larga válida con más de veinte caracteres", cfg))
    assert any("repeticion_excesiva" in m for m in am.validar_texto(
        "Habitación aaaaamenameplia válida", "Descripción larga válida con más de veinte caracteres", cfg))
    assert any("fotos_insuficientes" in m for m in am.validar_imagenes(["https://a/1.jpg"], cfg))
    assert any("extensiones" in m for m in am.validar_imagenes(
        ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.exe"], cfg))


def test_automod_on_aprueba_con_score(limpieza):
    import asyncio
    from app.services import auto_moderation as am
    email, h = _usuario_verificado(limpieza, "auto")

    async def _flag(on: bool):
        from app.db.session import AsyncSession
        from app.models import SystemSetting
        from sqlalchemy import select
        async with AsyncSession() as db:
            res = await db.execute(
                select(SystemSetting).where(SystemSetting.clave == "moderacion_automatica"))
            row = res.scalars().first()
            if row is None:
                db.add(SystemSetting(clave="moderacion_automatica", valor="true" if on else "false",
                                     tipo="bool", descripcion="test"))
            else:
                row.valor = "true" if on else "false"
            await db.commit()
    asyncio.run(_flag(True))
    try:
        # Datos ricos (descripción >200 + 4 fotos) para score >= 0.85.
        rico = dict(PUB, descripcion=("Habitación amplia, iluminada y ventilada cerca al campus, "
                                      "con baño privado, cocina compartida equipada, lavandería, "
                                      "internet fibra óptica y vigilancia las 24 horas del día. " * 2),
                    fotos=["https://a.com/1.jpg", "https://a.com/2.jpg",
                           "https://a.com/3.jpg", "https://a.com/4.jpg"])
        r = client.post("/api/publicaciones", json=rico, headers=h)
        assert r.status_code == 201, r.text
        assert r.json()["estado"] == "ACTIVO"
        assert r.json()["moderacion"]["decision"] == "APPROVE"
        pid = r.json()["id"]
        aud = client.get("/api/admin/auditoria", params={"publicacion_id": pid}, headers=ADM)
        assert any("auto:" in (a["detalle"] or "") for a in aud.json()["items"])
    finally:
        asyncio.run(_flag(False))


# --- Settings: validación de rangos nuevos -----------------------------------------
def test_settings_rangos_v152():
    assert client.patch("/api/admin/automation/settings/umbral_aprobacion_ia",
                        json={"valor": "1.5"}, headers=ADM).status_code == 422
    assert client.patch("/api/admin/automation/settings/umbral_aprobacion_ia",
                        json={"valor": "0.9"}, headers=ADM).status_code == 200
    assert client.patch("/api/admin/automation/settings/moderacion_automatica",
                        json={"valor": "quizas"}, headers=ADM).status_code == 422
    assert client.patch("/api/admin/automation/settings/dias_desactualizada",
                        json={"valor": "45"}, headers=ADM).status_code == 200
    assert client.patch("/api/admin/automation/settings/clave_inexistente",
                        json={"valor": "1"}, headers=ADM).status_code == 404


# --- Upload unitaria + vincular + settings fail-closed ------------------------------
def test_upload_una_y_vincular(limpieza):
    email, h = _usuario_verificado(limpieza, "upl")
    # Publicar primero promueve a ARRENDADOR (el upload lo exige).
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    # 1 archivo válido (JPEG mínimo con magic).
    contenido = b"\xff\xd8\xff" + b"\x00" * 100
    r = client.post("/api/publicaciones/upload/una", files={"file": ("foto.jpg", contenido, "image/jpeg")}, headers=h)
    assert r.status_code == 200, r.text
    url = r.json()["urls"][0]
    # Sin token -> 401.
    assert client.post("/api/publicaciones/upload/una",
                       files={"file": ("foto.jpg", contenido, "image/jpeg")}).status_code == 401
    v = client.post("/api/publicaciones/upload/vincular",
                    json={"publicacion_id": pid, "urls": [url]}, headers=h)
    assert v.status_code == 200, v.text
    assert v.json()["total"] == 4
    # Más de 10 -> 422.
    assert client.post("/api/publicaciones/upload/vincular",
                       json={"publicacion_id": pid, "urls": [url] * 8},
                       headers=h).status_code == 422


def test_settings_patch_db_caida_503():
    from app.db.session import get_session

    class _Dead:
        async def execute(self, *a, **k):
            raise RuntimeError("PG caído (test)")
        async def commit(self):
            raise RuntimeError("PG caído (test)")
        async def rollback(self):
            return None

    async def _dead():
        yield _Dead()

    app.dependency_overrides[get_session] = _dead
    try:
        r = client.patch("/api/admin/automation/settings/dias_vigencia_publicacion",
                         json={"valor": "31"}, headers=ADM)
        assert r.status_code == 503, r.text
    finally:
        app.dependency_overrides.pop(get_session, None)


# --- Visibilidad de vistas (default: solo dueño/admin) ------------------------------
def test_vistas_visibilidad_dueno_vs_publico(limpieza):
    email, h = _usuario_verificado(limpieza, "visib")
    pid = client.post("/api/publicaciones", json=PUB, headers=h).json()["id"]
    client.post(f"/api/publicaciones/{pid}/vista")
    # Búsqueda pública: oculta por defecto.
    pub = [p for p in client.get("/api/publicaciones", params={"size": 50}).json()["items"]
           if p["id"] == pid]
    # El aviso está PENDIENTE (no sale en búsqueda); se aprueba para el test.
    client.patch(f"/api/admin/publicaciones/{pid}", json={"estado": "ACTIVO"}, headers=ADM)
    pub = [p for p in client.get("/api/publicaciones", params={"size": 50}).json()["items"]
           if p["id"] == pid]
    assert pub and pub[0]["vistas"] is None
    # Dueño (mias y detalle con token): visible.
    mias = [p for p in client.get("/api/publicaciones/mias", headers=h).json()["items"]
            if p["id"] == pid]
    assert mias and mias[0]["vistas"] == 1
    det = client.get(f"/api/publicaciones/{pid}", headers=h).json()
    assert det["vistas"] == 1
    # Anónimo en detalle: oculto.
    assert client.get(f"/api/publicaciones/{pid}").json()["vistas"] is None
    # Admin lo ve siempre.
    assert client.get(f"/api/publicaciones/{pid}", headers=ADM).json()["vistas"] == 1


# --- Settings con sección --------------------------------------------------------------
def test_settings_trae_seccion(limpieza):
    r = client.get("/api/admin/automation/settings", headers=ADM)
    assert r.status_code == 200
    por_clave = {s["clave"]: s for s in r.json()}
    assert por_clave["vistas_visibles_publico"]["seccion"] == "visibilidad"
    assert por_clave["umbral_aprobacion_ia"]["seccion"] == "moderacion"
    assert por_clave["titulo_min"]["seccion"] == "publicaciones"
