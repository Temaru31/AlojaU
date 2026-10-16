"""Preferencias roomie: catálogo + ingresar + editar (modo MOCK_USERS)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)
H = {"Authorization": "Bearer mock-token-estudiante"}
EMAIL = "estudiante@alojau.com"


@pytest.fixture()
def mock_prefs_limpio():
    """Foto/restaura MOCK_USERS del estudiante (los tests mutan preferencias)."""
    original = dict(auth_router.MOCK_USERS.get(EMAIL, {}))
    yield
    if original:
        auth_router.MOCK_USERS[EMAIL] = original
    else:
        auth_router.MOCK_USERS.pop(EMAIL, None)


# Test 1: listar opciones de personalización.
def test_listar_enums_preferencias():
    r = client.get("/api/preferencias/enums")
    assert r.status_code == 200, r.text
    enums = r.json()["enums"]
    assert len(enums) == 9
    por_nombre = {e["nombre"]: e for e in enums}
    esperados = {"MomentoAseoSemana", "HorarioAseo", "EstiloCocina",
                 "TiempoLavarLoza", "FuenteIngresos", "EstabilidadIngresos",
                 "RasgoPositivo", "RasgoNegativo", "TipoHorarioSueno"}
    assert set(por_nombre) == esperados
    for e in enums:
        assert e["clave_json"].startswith("roomie.")
        assert len(e["opciones"]) >= 2
        assert e["opciones"][0]["valor"] == "sin_dato"
    assert {o["valor"] for o in por_nombre["MomentoAseoSemana"]["opciones"]} >= {
        "sin_dato", "entre_semana", "fin_de_semana"}
    assert "manana_6am_11am" in {o["valor"] for o in por_nombre["HorarioAseo"]["opciones"]}
    assert por_nombre["RasgoPositivo"]["es_lista"] is True
    assert "respetuoso" in {o["valor"] for o in por_nombre["RasgoPositivo"]["opciones"]}
    assert "impaciente" in {o["valor"] for o in por_nombre["RasgoNegativo"]["opciones"]}
    assert por_nombre["TipoHorarioSueno"]["clave_json"] == "roomie.sueno_tipo"


# Test 2: ingresar preferencias desde cero (MOCK_USERS).
def test_ingresar_preferencias_mock(mock_prefs_limpio):
    auth_router.MOCK_USERS[EMAIL]["preferencias"] = {}
    payload = {
        "roomie.aseo_momento_semana": "entre_semana",
        "roomie.aseo_horario": "manana_6am_11am",
        "roomie.cocina_estilo": "organizad@",
        "roomie.loza_tiempo": "inmediatamente",
        "roomie.ingresos_fuente": "trabajo_fijo",
        "roomie.ingresos_estabilidad": "estable",
        "roomie.pagos_puntual": True,
        "roomie.rasgos_positivos": ["respetuoso", "paciente"],
        "roomie.rasgos_negativos": ["impaciente", "malhumorad@"],
        "roomie.sueno_hora_dormir": "23:00",
        "roomie.sueno_hora_despertar": "06:30",
        "roomie.sueno_tipo": "estable",
        "roomie.invitados_pareja": False,
        "roomie.mascotas": True,
        "roomie.invitados_plan": True,
    }
    r = client.patch("/api/auth/perfil", json={"preferencias": payload}, headers=H)
    assert r.status_code == 200, r.text
    for k, v in payload.items():
        assert r.json()["preferencias"].get(k) == v
    g = client.get("/api/auth/perfil", headers=H)
    assert g.status_code == 200
    for k, v in payload.items():
        assert g.json()["preferencias"].get(k) == v


# Test 3: editar preferencias (merge: lo no enviado se conserva).
def test_editar_preferencias_mock(mock_prefs_limpio):
    auth_router.MOCK_USERS[EMAIL]["preferencias"] = {}
    base = {
        "roomie.aseo_momento_semana": "entre_semana",
        "roomie.aseo_horario": "manana_6am_11am",
        "roomie.mascotas": True,
        "roomie.rasgos_positivos": ["respetuoso"],
    }
    assert client.patch("/api/auth/perfil", json={"preferencias": base}, headers=H).status_code == 200
    edicion = {
        "roomie.aseo_horario": "tarde_12pm_6pm",
        "roomie.mascotas": False,
        "roomie.rasgos_positivos": ["respetuoso", "paciente"],
    }
    r = client.patch("/api/auth/perfil", json={"preferencias": edicion}, headers=H)
    assert r.status_code == 200, r.text
    prefs = r.json()["preferencias"]
    assert prefs.get("roomie.aseo_horario") == "tarde_12pm_6pm"
    assert prefs.get("roomie.mascotas") is False
    assert prefs.get("roomie.rasgos_positivos") == ["respetuoso", "paciente"]
    assert prefs.get("roomie.aseo_momento_semana") == "entre_semana"
    g = client.get("/api/auth/perfil", headers=H)
    assert g.json()["preferencias"].get("roomie.aseo_horario") == "tarde_12pm_6pm"
    assert g.json()["preferencias"].get("roomie.aseo_momento_semana") == "entre_semana"
