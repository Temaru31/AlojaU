"""Fail-closed sin base de datos: 503 explícito, nunca 200 parcial ni 500 opaco.

El backend no tiene modo de datos en memoria: con PostgreSQL caído, todo lo
que lo necesita responde 503 (igual en dev y en prod). Solo dos lecturas
públicas son resilientes por diseño y responden 200 con datos estáticos:
`/api/publicaciones/config-publica` (DEFAULTS) y `/api/housing-types`
(catálogo del seed). El panel de ajustes admin lista los DEFAULTS si falla
solo su lectura (con la BD caída entera, el rol ADMIN no es verificable: 503).

Se fuerza la caída sobrescribiendo `get_session` con una sesión que falla.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_session
from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)

H_ARR = {"Authorization": "Bearer mock-token-arrendador"}
H_ADM = {"Authorization": "Bearer mock-token-admin"}
BD_NO_DISPONIBLE = 503


class _Muerta:
    """Sesión que falla como PG caído (solo rollback/add son noop)."""

    async def _falla(self, *a, **k):
        raise RuntimeError("PG caído (test fail-closed)")

    execute = get = commit = flush = delete = refresh = _falla

    async def rollback(self):
        return None

    def add(self, *a, **k):
        return None


async def _muerta_gen():
    yield _Muerta()


@pytest.fixture(params=["dev", "prod"])
def db_muerta(request, monkeypatch):
    """BD caída en dev y en prod: el comportamiento debe ser idéntico."""
    from app.core import security
    from app.core.config import settings
    from app.routers import admin_automation, campus, ciudades, zonas
    from app.services import housing_types

    if request.param == "prod":
        monkeypatch.setenv("ENV", "prod")
        monkeypatch.setattr(settings, "USE_MOCK_FALLBACK", False)
        monkeypatch.setattr(settings, "ENV", "prod")
    app.dependency_overrides[get_session] = _muerta_gen
    for limpiar in (admin_automation.clear_settings_cache, campus.clear_campus_cache,
                    ciudades.clear_ciudades_cache, zonas.clear_zonas_cache,
                    housing_types.clear_cache, security.clear_rol_cache_for_tests):
        limpiar()
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._OTP_SOLICITAR.clear()
    yield request.param
    app.dependency_overrides.pop(get_session, None)
    auth_router._LOGIN_ATTEMPTS.clear()
    auth_router._OTP_SOLICITAR.clear()


def h_legacy(rol="ARRENDADOR", uid=1, **extra):
    """JWT real sin jti (legacy): pasa la firma y no consulta revocación."""
    import jwt
    from app.core.config import settings
    payload = {"sub": "legacy@alojau.com", "rol": rol, "id": uid,
               "exp": datetime.now(timezone.utc) + timedelta(hours=1), **extra}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)}"}


def test_lecturas_publicas_503(db_muerta):
    assert client.get("/api/publicaciones").status_code == BD_NO_DISPONIBLE
    assert client.get("/api/publicaciones/1").status_code == BD_NO_DISPONIBLE
    assert client.get("/api/publicaciones/1/similares").status_code == BD_NO_DISPONIBLE
    assert client.post("/api/publicaciones/1/vista").status_code == BD_NO_DISPONIBLE


def test_lecturas_publicas_resilientes_200(db_muerta):
    config = client.get("/api/publicaciones/config-publica")
    assert config.status_code == 200, config.text
    assert config.json()["titulo_max"] == 150
    tipos = client.get("/api/housing-types")
    assert tipos.status_code == 200
    assert len(tipos.json()) >= 1


def test_catalogos_503(db_muerta):
    for ruta in ("/api/zonas", "/api/campus", "/api/ciudades"):
        assert client.get(ruta).status_code == BD_NO_DISPONIBLE, ruta


def test_escritura_dueno_503(db_muerta):
    h = h_legacy("ARRENDADOR", 1, telefono_whatsapp="573001234567",
                 email_verificado=True, telefono_verificado=True)
    assert client.patch("/api/publicaciones/1", json={"titulo": "Habitación temporal amplia x"},
                        headers=h).status_code == BD_NO_DISPONIBLE
    assert client.delete("/api/publicaciones/1", headers=h).status_code == BD_NO_DISPONIBLE
    assert client.get("/api/publicaciones/mias", headers=h).status_code == BD_NO_DISPONIBLE
    assert client.patch("/api/publicaciones/1/fotos", json={"fotos": ["https://a.com/1.jpg"]},
                        headers=h).status_code == BD_NO_DISPONIBLE
    assert client.delete("/api/publicaciones/upload/1001", headers=h).status_code == BD_NO_DISPONIBLE


def test_admin_503_y_ajustes_por_defecto(db_muerta):
    ha = h_legacy("ADMIN", 2)
    for ruta in ("/api/admin/metricas", "/api/admin/pendientes", "/api/admin/auditoria", "/api/reportes"):
        assert client.get(ruta, headers=ha).status_code == BD_NO_DISPONIBLE, ruta
    assert client.patch("/api/admin/publicaciones/1", json={"estado": "ACTIVO"},
                        headers=ha).status_code == BD_NO_DISPONIBLE
    assert client.post("/api/admin/publicaciones/bulk-approve", json={"ids": [1]},
                       headers=ha).status_code == BD_NO_DISPONIBLE
    assert client.post("/api/admin/automation/evaluar/1", headers=ha).status_code == BD_NO_DISPONIBLE
    # Con la BD caída el rol ADMIN no es verificable: 503, nunca 403 ni datos.
    assert client.get("/api/admin/automation/settings", headers=ha).status_code == BD_NO_DISPONIBLE


def test_ajustes_por_defecto_si_falla_solo_la_lectura(db_muerta):
    """Admin ya verificado y la lectura de ajustes falla: lista los DEFAULTS."""
    from app.core.security import require_admin

    app.dependency_overrides[require_admin] = lambda: {"id": 2, "rol": "ADMIN"}
    try:
        ajustes = client.get("/api/admin/automation/settings", headers=h_legacy("ADMIN", 2))
    finally:
        app.dependency_overrides.pop(require_admin, None)
    assert ajustes.status_code == 200
    assert any(s["clave"] == "dias_vigencia_publicacion" for s in ajustes.json())


def test_auth_503(db_muerta):
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "x"}).status_code == BD_NO_DISPONIBLE
    assert client.post("/api/auth/register", json={
        "email": "nuevo_fail_closed@alojau.com", "password": "Clave1234!x",
        "nombre_completo": "Usuario Fail Closed", "acepto_tratamiento_datos": True,
    }).status_code == BD_NO_DISPONIBLE
    assert client.post("/api/auth/otp/solicitar",
                       json={"email": "a@b.co", "proposito": "email_verify"}).status_code == BD_NO_DISPONIBLE
    assert client.post("/api/auth/recovery/solicitar", json={"email": "a@b.co"}).status_code == BD_NO_DISPONIBLE


def test_reportes_503(db_muerta):
    assert client.post("/api/reportes", json={
        "publicacion_id": 1, "motivo": "OTRO", "detalle": "detalle largo x"}).status_code == BD_NO_DISPONIBLE
    assert client.patch("/api/reportes/1", json={"accion": "confirmar"},
                        headers=h_legacy("ADMIN", 2)).status_code == BD_NO_DISPONIBLE
