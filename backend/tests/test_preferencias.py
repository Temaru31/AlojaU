"""Preferencias roomie: catálogo de opciones de personalización."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
H = {"Authorization": "Bearer mock-token-estudiante"}
EMAIL = "estudiante@alojau.com"


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


