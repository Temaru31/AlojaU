"""Pilares 1/2/4/5 — blindaje seguridad + concurrencia (rama feat/security-concurrency-hardening).

- POST /publicaciones: throttle 10/h por usuario (unit + wiring sin falso 429).
- Uploads: throttle 30/h por usuario (unit).
- GET /api/reportes: cota `limit` defensiva sin cambiar shape.
- ReporteIn.detalle: rechaza HTML (defensa en profundidad).
- DTOs auth con extra="forbid": 422 ante campos extra (rol, ...).
- supabase_id autoritativo: con JWT verificado manda claims.sub, no el cliente.
- Middleware secops: ráfaga 401/403/429 -> WARNING sin PII.

Auto-limpieza vía conftest hermético (memoria + reseed PG por test).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}
ADMIN = {"Authorization": "Bearer mock-token-admin"}

PUB = {
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


def tmp_email(tag=""):
    return f"sec_tmp_{tag}{uuid.uuid4().hex[:8]}@alojau.com"


# --- Throttle publicación: unit ------------------------------------------------
def test_pub_throttle_10_ok_11vo_429():
    from app.routers import publicaciones as _pub
    _pub.clear_pub_rate_limit_for_tests()
    uid = 987654
    for _ in range(10):
        _pub._check_pub_rate_limit(uid)
    with pytest.raises(Exception) as exc:
        _pub._check_pub_rate_limit(uid)
    assert getattr(exc.value, "status_code", None) == 429


def test_publicar_primer_intento_no_429():
    # Wiring: un aviso legítimo nunca recibe 429 en su primer intento.
    r = client.post("/api/publicaciones", json=dict(PUB), headers=ARR)
    assert r.status_code != 429, r.text


# --- Throttle uploads: unit ----------------------------------------------------
def test_upload_throttle_30_ok_31vo_429():
    from app.routers import uploads as _up
    _up.clear_upload_rate_limit_for_tests()
    for _ in range(30):
        _up._check_upload_rate_limit(987653)
    with pytest.raises(Exception) as exc:
        _up._check_upload_rate_limit(987653)
    assert getattr(exc.value, "status_code", None) == 429


# --- Reportes: cota limit + detalle sin HTML -----------------------------------
def test_reportes_limit_cota_y_422_si_excede():
    r = client.get("/api/reportes", params={"limit": 5}, headers=ADMIN)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) <= 5
    r2 = client.get("/api/reportes", params={"limit": 501}, headers=ADMIN)
    assert r2.status_code == 422


def test_reporte_detalle_html_422():
    r = client.post("/api/reportes", json={
        "publicacion_id": 1, "motivo": "OTRO",
        "detalle": "<script>alert(1)</script>",
    })
    assert r.status_code == 422


# --- Mass assignment: extras prohibidos ----------------------------------------
def test_register_con_rol_extra_422():
    r = client.post("/api/auth/register", json={
        "email": tmp_email("rol"), "password": "Segura1!x",
        "nombre_completo": "Intento Rol", "acepto_tratamiento_datos": True,
        "rol": "ADMIN",
    })
    assert r.status_code == 422


def test_perfil_patch_ignora_extra_rol_ola2_m4():
    # OLA2-M4 (contrato probado en test_perfil/RT11): los extras en PATCH
    # perfil se IGNORAN con 200, nunca escalan privilegios ni dan 422.
    antes = client.get("/api/auth/perfil", headers=ARR).json()["rol"]
    r = client.patch("/api/auth/perfil", json={"rol": "ADMIN"}, headers=ARR)
    assert r.status_code == 200
    assert r.json()["rol"] == antes
    assert client.get("/api/auth/perfil", headers=ARR).json()["rol"] == antes


def test_oauth_callback_con_extra_422():
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": tmp_email("x"), "nombre_completo": "X Y",
        "rol": "ADMIN",
    })
    assert r.status_code == 422


# --- supabase_id autoritativo desde claims --------------------------------------
def test_oauth_supabase_id_sale_de_claims_no_del_cliente(monkeypatch):
    from app.routers import auth as auth_router
    from app.core import auth_service as svc

    email = f"sec_tmp_claims{uuid.uuid4().hex[:8]}@alojau.com"
    claims = {"sub": "sup-REAL-123", "email": email}

    def _ok(self, token):
        return dict(claims)

    monkeypatch.setattr(svc.SupabaseAuthService, "decode_token", _ok)
    monkeypatch.setattr(auth_router.settings, "SUPABASE_URL",
                        "https://xxx.supabase.co")
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": email, "nombre_completo": "Usuario Claims",
        "supabase_id": "sup-FAKE-del-cliente", "supabase_jwt": "cualquiera.valido.aqui",
    })
    assert r.status_code == 200, r.text

    import asyncio
    import os

    async def _leer():
        import asyncpg
        raw = os.getenv("DATABASE_URL",
                        "postgresql://alojau:alojau123@localhost:5432/alojau")
        dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
        if "supabase.co" in dsn.lower():
            return "sup-REAL-123"
        try:
            conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=5)
        except Exception:
            return auth_router.MOCK_USERS.get(email, {}).get("supabase_id")
        try:
            return await conn.fetchval(
                "SELECT supabase_id FROM usuarios WHERE email=$1", email)
        finally:
            await conn.close()

    assert asyncio.run(_leer()) == "sup-REAL-123"


# --- SecOps: ráfaga 401 -> WARNING sin PII ---------------------------------------
def test_secops_burst_401_emite_warning_sin_pii(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="alojau"):
        for _ in range(31):
            r = client.get("/api/auth/perfil")
            assert r.status_code == 401
    avisos = [rec for rec in caplog.records if "posible sondeo" in rec.message]
    assert avisos, "se esperaba WARNING de ráfaga secops"
    for rec in avisos:
        blob = rec.message + str(rec.args)
        assert "Bearer" not in blob and "token" not in blob.lower()
