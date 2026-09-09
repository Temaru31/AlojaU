from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_get_perfil_sin_auth():
    r = client.get("/api/auth/perfil")
    assert r.status_code == 401

def test_get_perfil_con_mock_token():
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    r = client.get("/api/auth/perfil", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "arrendador@alojau.com"
    assert "telefono_whatsapp" in data
    assert "telefono_verificado" in data
    assert data["rol"] == "ARRENDADOR"

def test_patch_perfil_telefono_y_verificar():
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    payload = {
        "telefono_whatsapp": "573112233445",
        "telefono_verificado": True
    }
    r = client.patch("/api/auth/perfil", json=payload, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["telefono_whatsapp"] == "573112233445"
    assert data["telefono_verificado"] is True

    # Verificar que GET posterior refleje los cambios
    r_get = client.get("/api/auth/perfil", headers=headers)
    assert r_get.status_code == 200
    assert r_get.json()["telefono_whatsapp"] == "573112233445"
    assert r_get.json()["telefono_verificado"] is True

def test_verificar_telefono_sube_20_puntos_confianza():
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    # 1. Desverificar
    r1 = client.patch("/api/auth/perfil", json={"telefono_verificado": False}, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["telefono_verificado"] is False

    pub_sin = client.get("/api/publicaciones/1").json()
    score_sin = pub_sin["indice_confianza"]
    assert pub_sin["desglose"]["telefono"] == 0

    # 2. Verificar en 1 clic
    r2 = client.patch("/api/auth/perfil", json={"telefono_verificado": True}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["telefono_verificado"] is True

    pub_con = client.get("/api/publicaciones/1").json()
    score_con = pub_con["indice_confianza"]
    assert pub_con["desglose"]["telefono"] == 20
    assert score_con == score_sin + 20

