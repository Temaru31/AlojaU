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

def test_patch_perfil_actualiza_telefono_y_nombre():
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    payload = {
        "telefono_whatsapp": "573112233445",
        "nombre_completo": "Arrendador Actualizado",
    }
    r = client.patch("/api/auth/perfil", json=payload, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["telefono_whatsapp"] == "573112233445"
    assert data["nombre_completo"] == "Arrendador Actualizado"

    # Verificar que GET posterior refleje los cambios
    r_get = client.get("/api/auth/perfil", headers=headers)
    assert r_get.status_code == 200
    assert r_get.json()["telefono_whatsapp"] == "573112233445"

def test_patch_perfil_ignora_telefono_verificado_ola2():
    # OLA2-M4: el flag es solo-lectura; enviarlo no debe cambiarlo (ni subir ni bajar).
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    antes = client.get("/api/auth/perfil", headers=headers).json()["telefono_verificado"]

    r = client.patch("/api/auth/perfil", json={"telefono_verificado": not antes}, headers=headers)
    assert r.status_code == 200
    assert r.json()["telefono_verificado"] is antes

    despues = client.get("/api/auth/perfil", headers=headers).json()["telefono_verificado"]
    assert despues is antes

def test_auto_verificacion_no_cambia_confianza_ola2():
    # OLA2-M4 regresión: intentar auto-verificarse no mueve el índice ni el desglose.
    headers = {"Authorization": "Bearer mock-token-arrendador"}
    pub_antes = client.get("/api/publicaciones/1").json()

    r = client.patch("/api/auth/perfil", json={"telefono_verificado": True}, headers=headers)
    assert r.status_code == 200

    pub_despues = client.get("/api/publicaciones/1").json()
    assert pub_despues["indice_confianza"] == pub_antes["indice_confianza"]
    assert pub_despues["desglose"]["telefono"] == pub_antes["desglose"]["telefono"]

