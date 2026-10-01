"""Fase 2: endpoints de bandeja + CRUD de alertas (contratos estrictos).

- GET puro (sin escrituras), paginado + no_leidas + filtro.
- PATCH leer: 404 ajeno-inexistente, 403 ajeno-existente (IDOR).
- PATCH leer-todas.
- POST busquedas: mínimo 1 filtro, tope 10 activas, FKs y rango validados.
- DELETE propio/ajeno/inexistente.
Requiere PG real; si no, skip (igual que los tests de Telegram).
"""
import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}  # id 1
EST = {"Authorization": "Bearer mock-token-estudiante"}  # id 3


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


def _aplicar_espejo_019():
    """Crea las tablas si faltan (BD fresca u orden alterado). Idempotente."""
    import pathlib
    mirror = pathlib.Path(__file__).resolve().parent.parent / "db" / "migrations" \
        / "019_notificaciones_y_busquedas.sql"
    texto = mirror.read_text(encoding="utf-8").split("-- DOWNGRADE")[0]
    for chunk in texto.split(";"):
        stmt = "\n".join(ln for ln in chunk.splitlines()
                         if ln.strip() and not ln.strip().startswith("--")).strip()
        if stmt:
            asyncio.run(_sql(stmt))


async def _truncate_seguro():
    """TRUNCATE tolerante a BD fresca u orden alterado (nunca falla)."""
    import asyncpg
    conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
    try:
        hay = await conn.fetchval(
            "SELECT count(*) FROM pg_tables WHERE tablename IN "
            "('notificaciones','busquedas_guardadas')")
        if hay == 2:
            await conn.execute("TRUNCATE notificaciones, busquedas_guardadas")
    finally:
        await conn.close()


@pytest.fixture()
def limpias():
    if not _pg():
        pytest.skip("sin PG real")
    _aplicar_espejo_019()
    asyncio.run(_truncate_seguro())
    yield
    asyncio.run(_truncate_seguro())


def _notif(uid, evento=None, titulo="Aviso"):
    evento = evento or f"ev-{uuid.uuid4().hex[:8]}"
    row = asyncio.run(_sql(
        "INSERT INTO notificaciones (usuario_id, evento_id, tipo, titulo) "
        "VALUES ($1, $2, 'nuevo_arriendo', $3) RETURNING id",
        uid, evento, titulo))
    return row[0]["id"]


def _alerta_post(headers, **campos):
    body = {"precio_min": 300000, "precio_max": 600000}
    body.update(campos)
    return client.post("/api/busquedas-guardadas", json=body, headers=headers)


# --- Bandeja ------------------------------------------------------------------
def test_bandeja_vacia_y_lectura_pura(limpias):
    r = client.get("/api/notificaciones", headers=ARR)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["items"] == [] and data["total"] == 0 and data["no_leidas"] == 0
    assert (data["page"], data["size"], data["pages"]) == (1, 9, 0)
    # Lectura pura: repetir el GET no crea ni muta filas.
    r2 = client.get("/api/notificaciones", headers=ARR)
    assert r2.json()["total"] == 0


def test_bandeja_paginada_conteo_y_filtro(limpias):
    for i in range(3):
        _notif(1, evento=f"pg-{i}")
    asyncio.run(_sql(
        "UPDATE notificaciones SET leida=TRUE WHERE evento_id='pg-0' AND usuario_id=1"))
    r = client.get("/api/notificaciones", params={"size": 2}, headers=ARR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3 and data["no_leidas"] == 2
    assert len(data["items"]) == 2 and data["pages"] == 2
    assert data["items"][0]["leida"] in (True, False)
    r2 = client.get("/api/notificaciones",
                    params={"solo_no_leidas": True}, headers=ARR)
    assert r2.json()["total"] == 2
    assert all(not it["leida"] for it in r2.json()["items"])


def test_leer_una_marca_y_sella_tiempo(limpias):
    nid = _notif(1)
    r = client.patch(f"/api/notificaciones/{nid}/leer", headers=ARR)
    assert r.status_code == 200, r.text
    assert r.json()["leida"] is True
    assert r.json()["leida_en"] is not None
    assert client.get("/api/notificaciones", headers=ARR).json()["no_leidas"] == 0


def test_leer_ajena_403_y_ausente_404(limpias):
    nid = _notif(1)
    assert client.patch(f"/api/notificaciones/{nid}/leer", headers=EST).status_code == 403
    assert client.patch("/api/notificaciones/999999/leer", headers=ARR).status_code == 404
    # La ajena sigue sin leer (el 403 no mutó nada).
    r = client.get("/api/notificaciones", headers=ARR)
    assert r.json()["no_leidas"] == 1


def test_leer_todas(limpias):
    _notif(1, evento="t-a")
    _notif(1, evento="t-b")
    _notif(3, evento="t-c")
    r = client.patch("/api/notificaciones/leer-todas", headers=ARR)
    assert r.status_code == 200
    assert r.json()["actualizadas"] == 2
    assert client.get("/api/notificaciones", headers=ARR).json()["no_leidas"] == 0
    assert client.get("/api/notificaciones", headers=EST).json()["no_leidas"] == 1


def test_bandeja_sin_auth_401(limpias):
    assert client.get("/api/notificaciones").status_code == 401
    assert client.patch("/api/notificaciones/1/leer").status_code == 401
    assert client.patch("/api/notificaciones/leer-todas").status_code == 401


# --- Búsquedas -----------------------------------------------------------------
def test_busquedas_crud(limpias):
    r = client.post("/api/busquedas-guardadas",
                    json={"nombre": "Cerca U", "campus_id": 1,
                          "servicios_ids": [1, 2]}, headers=ARR)
    assert r.status_code == 201, r.text
    assert r.json()["campus_id"] == 1
    assert r.json()["servicios_ids"] == [1, 2]
    assert r.json()["activa"] is True
    r2 = client.get("/api/busquedas-guardadas", headers=ARR)
    assert len(r2.json()) == 1
    assert client.delete(
        f"/api/busquedas-guardadas/{r.json()['id']}", headers=ARR).status_code == 200
    assert client.get("/api/busquedas-guardadas", headers=ARR).json() == []


def test_busquedas_tope_10_activas(limpias):
    for _ in range(10):
        assert _alerta_post(ARR).status_code == 201
    r11 = _alerta_post(ARR)
    assert r11.status_code == 422
    assert "10" in r11.json()["detail"]


def test_sobre_limite_heredado_lee_y_borra_sin_romper(limpias):
    """Compat hacia atrás: con 12 activas (límite anterior), leer/listar/
    borrar siguen intactos; solo crear se bloquea con guía."""
    # Las 12 se crean directo en BD (simula herencia de otro límite).
    import asyncio as _aio

    async def _doce():
        import asyncpg
        conn = await _aio.wait_for(asyncpg.connect(_dsn()), timeout=10)
        try:
            for _ in range(12):
                await conn.execute(
                    "INSERT INTO busquedas_guardadas (usuario_id) VALUES (1)")
        finally:
            await conn.close()
    _aio.run(_doce())
    mias = client.get("/api/busquedas-guardadas", headers=ARR).json()
    assert len(mias) == 12
    assert client.post("/api/busquedas-guardadas",
                       json={"precio_min": 100}, headers=ARR).status_code == 422
    primera = mias[0]["id"]
    assert client.delete(f"/api/busquedas-guardadas/{primera}",
                         headers=ARR).status_code == 200
    assert len(client.get("/api/busquedas-guardadas", headers=ARR).json()) == 11


def test_busquedas_sin_filtros_422(limpias):
    r = client.post("/api/busquedas-guardadas", json={}, headers=ARR)
    assert r.status_code == 422
    assert "al menos un filtro" in r.json()["detail"]
    # Con un solo filtro (zona) sí pasa.
    assert _alerta_post(ARR, zona_barrio_id=1).status_code == 201


def test_busquedas_validan_fk_y_rango(limpias):
    assert _alerta_post(ARR, campus_id=999999).status_code == 422
    assert _alerta_post(ARR, zona_barrio_id=999999).status_code == 422
    r = client.post("/api/busquedas-guardadas",
                    json={"precio_min": 600000, "precio_max": 100000}, headers=ARR)
    assert r.status_code == 422


def test_busquedas_idor(limpias):
    rid = _alerta_post(ARR).json()["id"]
    assert client.delete(f"/api/busquedas-guardadas/{rid}", headers=EST).status_code == 403
    assert client.delete("/api/busquedas-guardadas/999999", headers=ARR).status_code == 404
    # La ajena sigue existiendo.
    assert len(client.get("/api/busquedas-guardadas", headers=ARR).json()) == 1


def test_busquedas_mias_no_fugan(limpias):
    _alerta_post(ARR)
    _alerta_post(EST)
    mias = client.get("/api/busquedas-guardadas", headers=ARR).json()
    assert len(mias) == 1


# --- Integración approve -> notificación ---------------------------------------
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


def _publicar():
    r = client.post("/api/publicaciones", json=dict(PUB_NUEVO), headers=ARR)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _bandeja_total(headers):
    return client.get("/api/notificaciones", headers=headers).json()


def test_approve_genera_notificacion(limpias):
    assert client.post("/api/busquedas-guardadas", json={"precio_max": 10000000}, headers=EST).status_code == 201
    pid = _publicar()
    r = client.patch(f"/api/admin/publicaciones/{pid}",
                     json={"estado": "ACTIVO"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    data = _bandeja_total(EST)
    assert data["total"] == 1 and data["no_leidas"] == 1
    assert data["items"][0]["publicacion_id"] == pid
    assert data["items"][0]["tipo"] == "nuevo_arriendo"
    # El dueño no se auto-alerta del matcher, pero SÍ recibe su aviso de
    # moderación (rediseño campanita).
    dueno = _bandeja_total(ARR)
    assert dueno["total"] == 1
    assert dueno["items"][0]["tipo"] == "moderacion"


def test_doble_approve_no_duplica(limpias):
    assert client.post("/api/busquedas-guardadas", json={"precio_max": 10000000}, headers=EST).status_code == 201
    pid = _publicar()
    assert client.patch(f"/api/admin/publicaciones/{pid}",
                        json={"estado": "ACTIVO"}, headers=ADMIN).status_code == 200
    assert client.patch(f"/api/admin/publicaciones/{pid}",
                        json={"estado": "ACTIVO"}, headers=ADMIN).status_code == 200
    assert _bandeja_total(EST)["total"] == 1


def test_savepoint_approve_sobrevive_matcher_roto(limpias, monkeypatch):
    """Matcher roto (excepción) -> la aprobación IGUAL queda ACTIVO (200) y
    sin notificaciones. Prueba del arbitraje savepoint."""
    from app.services import notifications_matcher as nm

    async def _roto(*a, **k):
        raise RuntimeError("matcher caído (test)")

    monkeypatch.setattr(nm, "evaluar_y_crear_notificaciones", _roto)
    assert client.post("/api/busquedas-guardadas", json={"precio_max": 10000000}, headers=EST).status_code == 201
    pid = _publicar()
    r = client.patch(f"/api/admin/publicaciones/{pid}",
                     json={"estado": "ACTIVO"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    det = client.get(f"/api/publicaciones/{pid}", headers=ARR).json()
    assert det["estado"] == "ACTIVO"
    assert _bandeja_total(EST)["total"] == 0
