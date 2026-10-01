"""CI fail-closed + ramas mock: cobertura honesta de la resiliencia.

Cada endpoint tiene 3 caminos: DB ok (cubierto por el resto de la suite),
DB caída + dev (fallback mock) y DB caída + prod (503 fail-closed). Este
archivo cubre los dos últimos forzando sesión muerta, sin mocks falsos:
- modo dev: se exige la respuesta mock DOCUMENTADA (payloads reales).
- modo prod (ENV=prod + token legacy sin jti): se exige 503 explícito,
  nunca 200 parcial ni 500 opaco.

Los tests que mutan MOCK_PUBS/MOCK_USERS restauran snapshots (sin fugas
entre archivos). Limpia rate-limits en memoria y cachés con TTL.
"""
import copy
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import get_session
from app.routers import auth as auth_router
from app.routers import publicaciones as pubs_router
from app.routers import uploads as uploads_router

client = TestClient(app)

H_ARR = {"Authorization": "Bearer mock-token-arrendador"}
H_ADM = {"Authorization": "Bearer mock-token-admin"}
H_EST = {"Authorization": "Bearer mock-token-estudiante"}


class _Muerta:
    """Sesión que falla como PG caído (solo rollback/add son noop)."""

    async def execute(self, *a, **k):
        raise RuntimeError("PG caído (test fail-closed)")

    async def get(self, *a, **k):
        raise RuntimeError("PG caído (test fail-closed)")

    async def commit(self):
        raise RuntimeError("PG caído (test fail-closed)")

    async def flush(self):
        raise RuntimeError("PG caído (test fail-closed)")

    async def delete(self, *a, **k):
        raise RuntimeError("PG caído (test fail-closed)")

    async def refresh(self, *a, **k):
        raise RuntimeError("PG caído (test fail-closed)")

    async def rollback(self):
        return None

    def add(self, *a, **k):
        return None


async def _muerta_gen():
    yield _Muerta()


@pytest.fixture()
def db_muerta():
    """Override get_session + snapshot de mocks + limpieza de stores."""
    from app.routers import admin_automation as _auto
    from app.routers import campus as _campus
    from app.routers import ciudades as _ciudades
    from app.routers import zonas as _zonas
    from app.core import security as _sec

    snap_pubs = copy.deepcopy(pubs_router.MOCK_PUBS)
    snap_users = copy.deepcopy(auth_router.MOCK_USERS)
    app.dependency_overrides[get_session] = _muerta_gen
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._PW_ATTEMPTS.clear()
    auth_router._OTP_SOLICITAR.clear()
    auth_router._OTP_VERIFICAR.clear()
    auth_router._MOCK_OTPS.clear()
    auth_router._MOCK_RESETS.clear()
    pubs_router._VISTAS_MEM.clear()
    pubs_router._VISTAS_MOCK_SET.clear()
    _sec.clear_rol_cache_for_tests()
    for mod in (_auto, _campus, _ciudades, _zonas):
        try:
            mod.clear_settings_cache() if hasattr(mod, "clear_settings_cache") else None
            mod.clear_campus_cache() if hasattr(mod, "clear_campus_cache") else None
            mod.clear_ciudades_cache() if hasattr(mod, "clear_ciudades_cache") else None
            mod.clear_zonas_cache() if hasattr(mod, "clear_zonas_cache") else None
        except Exception:
            pass
    yield
    app.dependency_overrides.pop(get_session, None)
    pubs_router.MOCK_PUBS.clear()
    pubs_router.MOCK_PUBS.extend(snap_pubs)
    auth_router.MOCK_USERS.clear()
    auth_router.MOCK_USERS.update(snap_users)
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._MOCK_OTPS.clear()
    auth_router._MOCK_RESETS.clear()
    pubs_router._VISTAS_MOCK_SET.clear()
    _sec.clear_rol_cache_for_tests()


@pytest.fixture()
def modo_prod(monkeypatch):
    """ENV=prod sin mock (fail-closed total)."""
    from app.core.config import settings as _s
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setattr(_s, "USE_MOCK_FALLBACK", False)
    monkeypatch.setattr(_s, "ENV", "prod")
    assert _s.mock_enabled is False
    yield


def token_legacy(rol="ARRENDADOR", uid=1, **extra):
    """JWT real sin jti (legacy pre-v13): pasa decode, salta revocación."""
    import jwt as _jwt
    from app.core.config import settings as _s
    payload = {"sub": "legacy@alojau.com", "rol": rol, "id": uid,
               "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    payload.update(extra)
    return _jwt.encode(payload, _s.SECRET_KEY, algorithm=_s.ALGORITHM)


def H_LEGACY(rol="ARRENDADOR", uid=1, **extra):
    return {"Authorization": f"Bearer {token_legacy(rol, uid, **extra)}"}


PUB_NUEVA = {
    "titulo": "Habitación temporal amplia fallback mock",
    "descripcion": "Descripción con más de veinte caracteres para mock",
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


def tmp_email(tag=""):
    return f"test_user_tmp_{tag}{uuid.uuid4().hex[:8]}@alojau.com"


# ---------------------------------------------------------------------------
# Lecturas públicas en mock (dev sin PG)
# ---------------------------------------------------------------------------
def test_lista_mock_paginada_con_portada(db_muerta):
    r = client.get("/api/publicaciones", params={"size": 50})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    # CardOut lleva fotos (portada primera) pero no imagenes (solo el detalle).
    assert len(body["items"][0]["fotos"]) == body["items"][0]["num_fotos"] > 0
    assert body["items"][0]["vistas"] is None


def test_detalle_mock_activo_y_privado(db_muerta):
    r = client.get("/api/publicaciones/1")
    assert r.status_code == 200, r.text
    assert r.json()["fotos"][0] == r.json()["imagenes"][0]["url"]
    assert client.get("/api/publicaciones/999999").status_code == 404
    # PENDIENTE sin dueño -> 404; con dueño -> 200.
    assert client.get("/api/publicaciones/3").status_code == 404
    assert client.get("/api/publicaciones/3", headers=H_ARR).status_code == 200


def test_mias_mock_dueno_con_vistas(db_muerta):
    r = client.get("/api/publicaciones/mias", headers=H_ARR)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 2
    assert isinstance(r.json()["items"][0]["vistas"], int)
    assert client.get("/api/publicaciones/mias").status_code == 401


def test_similares_mock_misma_zona(db_muerta):
    from datetime import timezone as _tz
    ahora = datetime.now(_tz.utc)
    extra = {"id": 9000, "titulo": "Vecina misma zona mock", "descripcion": "x",
             "tipo_inmueble": "APARTAESTUDIO", "canon_mensual": 500000,
             "deposito_requerido": 0, "zona_barrio_id": 1, "zona_nombre": "Pandiguando",
             "direccion_referencial": "dir", "reglas_convivencia": "r",
             "estado": "ACTIVO", "servicios": [], "servicios_ids": [1],
             "fotos": ["https://a.com/z.jpg"], "campus_ids": [1], "usuario_id": 2,
             "telefono_verificado": False, "reportes_activos": 0,
             "fecha_renovacion": ahora, "fecha_expiracion": ahora}
    pubs_router.MOCK_PUBS.append(extra)
    r = client.get("/api/publicaciones/1/similares")
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()["items"]] == [9000]
    assert client.get("/api/publicaciones/999999/similares").status_code == 404


def test_vista_mock_dedup(db_muerta):
    r1 = client.post("/api/publicaciones/1/vista")
    assert r1.json()["contada"] is True and r1.json()["vistas"] == 1
    r2 = client.post("/api/publicaciones/1/vista")
    assert r2.json()["contada"] is False
    assert client.post("/api/publicaciones/999999/vista").status_code == 404


def test_config_publica_nunca_503(db_muerta):
    r = client.get("/api/publicaciones/config-publica")
    assert r.status_code == 200, r.text
    assert r.json()["titulo_max"] == 150


# ---------------------------------------------------------------------------
# Escritura dueño en mock
# ---------------------------------------------------------------------------
def test_crear_mock_y_promocion_estudiante(db_muerta):
    # ESTUDIANTE con email verificado (mock) se promueve al publicar.
    auth_router.MOCK_USERS["estudiante@alojau.com"]["email_verificado"] = True
    r = client.post("/api/publicaciones", json=PUB_NUEVA, headers=H_EST)
    assert r.status_code == 201, r.text
    assert r.json()["rol_actualizado"] is True
    assert r.json()["estado"].startswith("PENDIENTE")
    assert auth_router.MOCK_USERS["estudiante@alojau.com"]["rol"] == "ARRENDADOR"


def test_editar_mock_dueno_ajeno_inexistente(db_muerta):
    r = client.patch("/api/publicaciones/1", json={"titulo": "Habitación mock reeditada amplia"}, headers=H_ARR)
    assert r.status_code == 200, r.text
    assert r.json()["titulo"] == "Habitación mock reeditada amplia"
    assert client.patch("/api/publicaciones/1", json={"titulo": "Habitación mock reeditada amplia"}, headers=H_EST).status_code == 403
    assert client.patch("/api/publicaciones/999999", json={"titulo": "Habitación mock reeditada amplia"}, headers=H_ARR).status_code == 404


def test_editar_mock_servicios_sincroniza_nombres(db_muerta):
    r = client.patch("/api/publicaciones/1", json={"servicios_ids": [1, 4]}, headers=H_ARR)
    assert r.status_code == 200, r.text
    assert sorted(r.json()["servicios_ids"]) == [1, 4]
    assert "Amoblado" in r.json()["servicios"]
    assert client.patch("/api/publicaciones/1", json={"servicios_ids": [9999]}, headers=H_ARR).status_code == 404


def test_eliminar_mock_democion_espejo(db_muerta):
    r = client.delete("/api/publicaciones/3", headers=H_ARR)
    assert r.status_code == 200, r.text
    assert r.json()["eliminada"] is True
    assert r.json()["rol_actualizado"] is False  # id=1 ACTIVO sigue vigente
    assert client.delete("/api/publicaciones/999999", headers=H_ARR).status_code == 404


def test_renovar_y_estado_mock(db_muerta):
    assert client.patch("/api/publicaciones/1/renovar", headers=H_ARR).status_code == 200
    r = client.patch("/api/publicaciones/1/estado", json={"estado": "PAUSADO"}, headers=H_ARR)
    assert r.status_code == 200 and r.json()["estado"] == "PAUSADO"
    assert client.patch("/api/publicaciones/1/estado", json={"estado": "EXPIRADO"}, headers=H_ARR).status_code == 422


def test_reemplazar_fotos_mock_y_422(db_muerta):
    pub = next(p for p in pubs_router.MOCK_PUBS if p["id"] == 1)
    ids = uploads_router._mock_ids_para(pub)
    r = client.patch("/api/publicaciones/1/fotos",
                     json={"fotos": [pub["fotos"][2], pub["fotos"][0], pub["fotos"][1]]},
                     headers=H_ARR)
    assert r.status_code == 200, r.text
    assert r.json()["fotos"][0] == pub["fotos"][0]
    assert [im["orden"] for im in r.json()["imagenes"]] == [1, 2, 3]
    assert client.patch("/api/publicaciones/1/fotos",
                        json={"fotos": [pub["fotos"][0], pub["fotos"][0]]}, headers=H_ARR).status_code == 422
    assert client.patch("/api/publicaciones/1/fotos",
                        json={"fotos": ["ftp://x/y.jpg"]}, headers=H_ARR).status_code == 422
    assert client.patch("/api/publicaciones/1/fotos",
                        json={"fotos": pub["fotos"]}, headers=H_EST).status_code == 403
    assert ids  # ids virtuales estables existen


# ---------------------------------------------------------------------------
# Uploads en mock (require_arrendador pasa por rol, sin tocar PG)
# ---------------------------------------------------------------------------
def test_uploads_gestor_mock(db_muerta):
    pub = next(p for p in pubs_router.MOCK_PUBS if p["id"] == 1)
    n0 = len(pub["fotos"])
    ids = uploads_router._mock_ids_para(pub)
    r = client.patch("/api/publicaciones/upload/orden",
                     json={"publicacion_id": 1, "orden_ids": ids[::-1]}, headers=H_ARR)
    assert r.status_code == 200 and r.json()["portada_id"] == ids[-1]
    assert client.patch("/api/publicaciones/upload/orden",
                        json={"publicacion_id": 1, "orden_ids": ids[:1]}, headers=H_ARR).status_code == 422
    v = client.post("/api/publicaciones/upload/vincular",
                    json={"publicacion_id": 1, "urls": ["https://tmp.com/x.jpg"]}, headers=H_ARR)
    assert v.status_code == 200 and v.json()["total"] == n0 + 1
    d = client.delete(f"/api/publicaciones/upload/{v.json()['ids'][-1]}", headers=H_ARR)
    assert d.status_code == 200 and d.json()["fotos_restantes"] == n0
    assert client.delete("/api/publicaciones/upload/999999", headers=H_ARR).status_code == 404


def test_upload_multipart_y_validaciones(db_muerta):
    bueno = b"\xff\xd8\xff" + b"\x00" * 100
    files = [("files", (f"f{i}.jpg", bueno, "image/jpeg")) for i in range(3)]
    r = client.post("/api/publicaciones/upload", files=files, headers=H_ARR)
    assert r.status_code == 200 and r.json()["count"] == 3
    assert client.post("/api/publicaciones/upload",
                       files=files[:2], headers=H_ARR).status_code == 422
    assert client.post("/api/publicaciones/upload",
                       files=[("files", ("x.txt", b"hola", "text/plain"))] * 3,
                       headers=H_ARR).status_code == 400
    assert client.post("/api/publicaciones/upload", files=files).status_code == 401


# ---------------------------------------------------------------------------
# Admin en mock
# ---------------------------------------------------------------------------
def test_admin_mock_metricas_pendientes(db_muerta):
    m = client.get("/api/admin/metricas", headers=H_ADM).json()
    assert m["total_publicaciones"] == len(pubs_router.MOCK_PUBS)
    assert m["pendientes"] == sum(1 for p in pubs_router.MOCK_PUBS if p.get("estado") == "PENDIENTE")
    p = client.get("/api/admin/pendientes", headers=H_ADM).json()
    assert p["total"] == m["pendientes"]
    assert client.get("/api/admin/metricas").status_code == 401
    assert client.get("/api/admin/metricas", headers=H_ARR).status_code == 403


def test_admin_mock_cambiar_eliminar(db_muerta):
    pub = next(p for p in pubs_router.MOCK_PUBS if p["id"] == 3)
    anterior = pub["estado"]
    assert anterior == "PENDIENTE"
    r = client.patch("/api/admin/publicaciones/3", json={"estado": "ACTIVO"}, headers=H_ADM)
    assert r.status_code == 200
    assert client.delete("/api/admin/publicaciones/3", headers=H_ADM).status_code == 204
    assert client.delete("/api/admin/publicaciones/999999", headers=H_ADM).status_code == 404
    assert client.patch("/api/admin/publicaciones/1", json={"estado": "ACTIVO"}, headers=H_ARR).status_code == 403


def test_admin_bulk_y_auditoria_fallan_cerrado_sin_pg(db_muerta):
    # Bulk y auditoría exigen PG incluso en dev (sin rama mock): 503 honesto.
    r = client.post("/api/admin/publicaciones/bulk-approve", json={"ids": [1]}, headers=H_ADM)
    assert r.status_code == 503
    assert client.get("/api/admin/auditoria", headers=H_ADM).status_code == 503


def test_automation_settings_listar_defaults_y_evaluar_503(db_muerta):
    r = client.get("/api/admin/automation/settings", headers=H_ADM)
    assert r.status_code == 200
    assert any(s["clave"] == "dias_vigencia_publicacion" for s in r.json())
    assert client.post("/api/admin/automation/evaluar/1", headers=H_ADM).status_code == 503


# ---------------------------------------------------------------------------
# Catálogos en mock (cachés con TTL limpio por fixture)
# ---------------------------------------------------------------------------
def test_catalogos_mock(db_muerta):
    z = client.get("/api/zonas").json()
    assert len(z) == 6 and z[0]["nombre"]
    assert client.get("/api/zonas").headers.get("X-Cache") == "HIT"
    c = client.get("/api/campus").json()
    assert isinstance(c, list) and len(c) >= 1
    ci = client.get("/api/ciudades").json()
    assert isinstance(ci, list) and len(ci) >= 1


# ---------------------------------------------------------------------------
# Auth en mock
# ---------------------------------------------------------------------------
def test_auth_register_login_perfil_mock(db_muerta):
    email = tmp_email("mock")
    r = client.post("/api/auth/register", json={
        "email": email, "password": "Mock1234!x", "nombre_completo": "Mock User",
        "acepto_tratamiento_datos": True})
    assert r.status_code == 200 and r.json()["mock"] is True
    assert client.post("/api/auth/register", json={
        "email": email, "password": "Mock1234!x", "nombre_completo": "Mock User",
        "acepto_tratamiento_datos": True}).status_code == 400
    t = client.post("/api/auth/login", json={"email": email, "password": "Mock1234!x"}).json()["access_token"]
    h = {"Authorization": f"Bearer {t}"}
    assert client.get("/api/auth/perfil", headers=h).json()["email"] == email
    assert client.patch("/api/auth/perfil/password",
                        json={"actual": "mala", "nueva": "Mock9999!x"}, headers=h).status_code == 403
    assert client.post("/api/auth/login", json={"email": email, "password": "mala"}).status_code == 401


def test_auth_otp_recovery_mock(db_muerta):
    email = tmp_email("mockotp")
    r = client.post("/api/auth/otp/solicitar", json={"email": email, "proposito": "email_verify"})
    assert r.status_code == 202 and r.json()["canal"] == "email"
    assert client.post("/api/auth/otp/verificar",
                       json={"email": email, "codigo": "000000", "proposito": "email_verify"}).status_code == 401
    for _ in range(10):
        client.post("/api/auth/otp/verificar",
                    json={"email": email, "codigo": "000000", "proposito": "email_verify"})
    assert client.post("/api/auth/otp/verificar",
                       json={"email": email, "codigo": "000000", "proposito": "email_verify"}).status_code == 429
    rec = client.post("/api/auth/recovery/solicitar", json={"email": email})
    assert rec.status_code == 202 and "dev_token" in rec.json()
    mal = client.post("/api/auth/recovery/confirmar", json={
        "email": email, "token": "x" * 32, "nueva_password": "Mock9999!x"})
    assert mal.status_code == 401


def test_auth_oauth_sesiones_promover_cuenta_mock(db_muerta):
    email = tmp_email("mockoauth")
    r = client.post("/api/auth/oauth/google/callback", json={
        "email": email, "nombre_completo": "Mock Google"})
    assert r.status_code == 200 and r.json()["es_nuevo"] is True and r.json()["mock"] is True
    r2 = client.post("/api/auth/oauth/google/callback", json={
        "email": "arrendador@alojau.com", "nombre_completo": "Arrendador Demo"})
    assert r2.status_code == 200 and "google" in auth_router.MOCK_USERS["arrendador@alojau.com"].get("auth_provider", "")
    s = client.get("/api/auth/sesiones", headers=H_ADM).json()
    assert isinstance(s, list) and s[0]["actual"] is True
    assert client.post("/api/auth/sesiones/revocar-todas", headers=H_ADM).status_code == 200
    assert client.post("/api/auth/logout", headers=H_ADM).json()["revocadas"] == 0
    assert client.post("/api/auth/logout-all", headers=H_ADM).status_code == 200
    # Estudiante mock se promueve.
    assert auth_router.MOCK_USERS["estudiante@alojau.com"]["rol"] == "ESTUDIANTE"
    assert client.post("/api/auth/promover", headers=H_EST).json()["rol"] == "ARRENDADOR"
    # Cuenta mock con password conocida: errónea 403, correcta elimina.
    email2 = tmp_email("mockdel")
    client.post("/api/auth/register", json={
        "email": email2, "password": "Mock1234!x", "nombre_completo": "Mock Del",
        "acepto_tratamiento_datos": True})
    h2 = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'email': email2, 'password': 'Mock1234!x'}).json()['access_token']}"}
    assert client.request("DELETE", "/api/auth/cuenta",
                          json={"confirm_email": email2, "password": "mala"},
                          headers=h2).status_code == 403
    assert client.request("DELETE", "/api/auth/cuenta",
                          json={"confirm_email": email2, "password": "Mock1234!x"},
                          headers=h2).status_code == 200
    assert auth_router.MOCK_USERS[email2].get("eliminado_en") is not None


def test_auth_update_perfil_mock_validaciones(db_muerta):
    assert client.patch("/api/auth/perfil", json={"telefono_whatsapp": "abc"},
                        headers=H_ARR).status_code == 422
    r = client.patch("/api/auth/perfil", json={"nombre_completo": "Nuevo Nombre Mock"},
                     headers=H_ARR)
    assert r.status_code == 200
    assert client.post("/api/auth/perfil/solicitud-verificacion", headers=H_ARR).status_code == 202


# ---------------------------------------------------------------------------
# Reportes sin PG: 503 honesto (sin rama mock por diseño)
# ---------------------------------------------------------------------------
def test_reportes_sin_pg_503(db_muerta):
    assert client.post("/api/reportes", json={
        "publicacion_id": 1, "motivo": "OTRO", "detalle": "detalle largo x"}).status_code == 503
    assert client.get("/api/reportes", headers=H_ADM).status_code == 503
    assert client.patch("/api/reportes/1", json={"accion": "confirmar"}, headers=H_ADM).status_code == 503


# ---------------------------------------------------------------------------
# Modo prod (fail-closed): todo lo que toca BD -> 503, nada parcial
# ---------------------------------------------------------------------------
def test_prod_publicas_503_y_config_200(db_muerta, modo_prod):
    assert client.get("/api/publicaciones").status_code == 503
    assert client.get("/api/publicaciones/1").status_code == 503
    assert client.get("/api/publicaciones/1/similares").status_code == 503
    assert client.post("/api/publicaciones/1/vista").status_code == 503
    # Lectura pública resiliente: nunca 503.
    assert client.get("/api/publicaciones/config-publica").status_code == 200


def test_prod_escritura_dueno_503(db_muerta, modo_prod):
    h = H_LEGACY("ARRENDADOR", 1, telefono_whatsapp="573001234567",
                 email_verificado=True, telefono_verificado=True)
    assert client.patch("/api/publicaciones/1", json={"titulo": "Habitación temporal amplia x"}, headers=h).status_code == 503
    assert client.delete("/api/publicaciones/1", headers=h).status_code == 503
    assert client.get("/api/publicaciones/mias", headers=h).status_code == 503
    assert client.patch("/api/publicaciones/1/fotos",
                        json={"fotos": ["https://a.com/1.jpg"]}, headers=h).status_code == 503
    assert client.delete("/api/publicaciones/upload/1001", headers=h).status_code == 503


def test_prod_admin_y_auth_503(db_muerta, modo_prod):
    ha = H_LEGACY("ADMIN", 2)
    assert client.get("/api/admin/metricas", headers=ha).status_code == 503
    assert client.get("/api/admin/pendientes", headers=ha).status_code == 503
    assert client.get("/api/admin/auditoria", headers=ha).status_code == 503
    assert client.get("/api/reportes", headers=ha).status_code == 503
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "x"}).status_code == 503
    assert client.post("/api/auth/otp/solicitar",
                       json={"email": "a@b.co", "proposito": "email_verify"}).status_code == 503
    assert client.post("/api/reportes", json={
        "publicacion_id": 1, "motivo": "OTRO", "detalle": "detalle largo x"}).status_code == 503
    # Zonas sin PG en prod: 503 (con caché limpio por fixture).
    assert client.get("/api/zonas").status_code == 503
