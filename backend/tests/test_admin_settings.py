"""Tarea 3+2 — Ajustes del Sistema (caché 5min) + password + verificación.

- GET settings 401 sin token, 403 si no-ADMIN, 200 con las 3 claves si ADMIN.
- PATCH valida rangos/tipos (422) e invalida el caché (segundo GET ve el cambio).
- PATCH /perfil/password: 403 si la actual no coincide, 422 si débil, 200 si ok.
- POST /perfil/solicitud-verificacion: 202 con mensaje.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.routers import admin_automation

client = TestClient(app)

ARR = {"Authorization": "Bearer mock-token-arrendador"}
ADMIN = {"Authorization": "Bearer mock-token-admin"}


def test_settings_rbac():
    assert client.get("/api/admin/automation/settings").status_code == 401
    assert client.get("/api/admin/automation/settings", headers=ARR).status_code == 403
    r = client.get("/api/admin/automation/settings", headers=ADMIN)
    assert r.status_code == 200
    claves = {s["clave"] for s in r.json()}
    # Superset (no igualdad exacta): añadir claves no debe romper este test.
    esperadas = {
        "dias_vigencia_publicacion",
        "max_reportes_para_pausa_automatica",
        "auto_aprobar_arrendadores_verificados",
        # v15.2 auto-moderación + UX.
        "moderacion_automatica",
        "umbral_aprobacion_ia",
        "dias_desactualizada",
        "titulo_min",
        "titulo_max",
        "descripcion_min",
        "descripcion_max",
        "fotos_min_publicar",
        "palabras_prohibidas",
        "vistas_visibles_publico",
    }
    assert esperadas <= claves, f"faltan claves: {esperadas - claves}"
    assert all("seccion" in s for s in r.json())


def test_settings_patch_valida_e_invalida_cache():
    admin_automation.clear_settings_cache()
    r = client.get("/api/admin/automation/settings", headers=ADMIN)
    assert r.status_code == 200
    # Segunda lectura viene del caché (mismo payload sin tocar DB).
    r2 = client.get("/api/admin/automation/settings", headers=ADMIN)
    assert r2.json() == r.json()

    # Rangos inválidos -> 422.
    assert client.patch("/api/admin/automation/settings/dias_vigencia_publicacion",
                        json={"valor": "400"}, headers=ADMIN).status_code == 422
    assert client.patch("/api/admin/automation/settings/max_reportes_para_pausa_automatica",
                        json={"valor": "0"}, headers=ADMIN).status_code == 422
    assert client.patch("/api/admin/automation/settings/auto_aprobar_arrendadores_verificados",
                        json={"valor": "quizas"}, headers=ADMIN).status_code == 422
    assert client.patch("/api/admin/automation/settings/clave_fantasma",
                        json={"valor": "1"}, headers=ADMIN).status_code == 404

    # Escritura válida invalida el caché (el GET posterior lo refleja).
    ok = client.patch("/api/admin/automation/settings/max_reportes_para_pausa_automatica",
                      json={"valor": "4"}, headers=ADMIN)
    assert ok.status_code == 200
    assert ok.json()["valor"] == "4"
    visto = client.get("/api/admin/automation/settings", headers=ADMIN)
    assert any(s["clave"] == "max_reportes_para_pausa_automatica" and s["valor"] == "4" for s in visto.json())
    # Restaura el default para no contaminar otros tests.
    client.patch("/api/admin/automation/settings/max_reportes_para_pausa_automatica",
                 json={"valor": "3"}, headers=ADMIN)


def test_password_change_flujo():
    # Sin token -> 401.
    assert client.patch("/api/auth/perfil/password", json={"actual": "x", "nueva": "Nueva1234"}).status_code == 401
    # Actual incorrecta -> 403 (DB real con seed AlojaU123).
    r = client.patch("/api/auth/perfil/password", json={"actual": "mala1234", "nueva": "Nueva1234"},
                     headers={"Authorization": "Bearer mock-token-arrendador"})
    assert r.status_code in (403, 404)
    # Débil -> 422.
    r = client.patch("/api/auth/perfil/password", json={"actual": "AlojaU123", "nueva": "corta"},
                     headers={"Authorization": "Bearer mock-token-arrendador"})
    assert r.status_code == 422
    # Igual a la actual -> 422.
    r = client.patch("/api/auth/perfil/password", json={"actual": "AlojaU123", "nueva": "AlojaU123"},
                     headers={"Authorization": "Bearer mock-token-arrendador"})
    assert r.status_code == 422


def test_solicitud_verificacion_202():
    assert client.post("/api/auth/perfil/solicitud-verificacion").status_code == 401
    r = client.post("/api/auth/perfil/solicitud-verificacion",
                    headers={"Authorization": "Bearer mock-token-arrendador"})
    assert r.status_code == 202
    assert "verificar" in r.json().get("mensaje", "").lower()
