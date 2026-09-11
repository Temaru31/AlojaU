"""
Seguridad básica (DoD-5) - OWASP Top 10 checks sin depender de IA
"""
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_cors_no_star():
    # CORS no debe ser "*"
    assert "*" not in settings.cors_origins_list, "CORS no debe permitir * con credentials (DoD-5)"
    # Header CORS en respuesta health
    r = client.get("/health", headers={"Origin": "http://localhost:5173"})
    # FastAPI CORSMiddleware debe reflejar origin permitido
    # Para origin no permitido no debe devolver *.
    assert r.headers.get("access-control-allow-origin") != "*"

def test_cors_rechaza_origen_no_permitido():
    r = client.get("/health", headers={"Origin": "http://evil.com"})
    # No debe devolver evil.com como allow-origin
    assert r.headers.get("access-control-allow-origin") != "http://evil.com"

def test_security_headers():
    r = client.get("/health")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    assert "referrer-policy" in {k.lower() for k in r.headers.keys()}

def test_secret_key_longitud():
    assert len(settings.SECRET_KEY) >= 32, "SECRET_KEY debe ser >=32 chars (DoD-5)"

def test_auth_missing_token_401():
    r = client.post("/api/publicaciones", json={})
    assert r.status_code == 401

def test_auth_empty_bearer_401():
    r = client.post("/api/publicaciones", json={}, headers={"Authorization": "Bearer "})
    assert r.status_code == 401
    r2 = client.post("/api/publicaciones", json={}, headers={"Authorization": "Bearer    "})
    assert r2.status_code == 401

def test_auth_formato_invalido_401():
    r = client.post("/api/publicaciones", json={}, headers={"Authorization": "Basic abc"})
    assert r.status_code == 401
    r2 = client.post("/api/publicaciones", json={}, headers={"Authorization": "Bearer"})
    assert r2.status_code == 401

def test_auth_token_invalido_401():
    r = client.post("/api/publicaciones", json={}, headers={"Authorization": "Bearer invalid.jwt.token"})
    assert r.status_code == 401

def test_sql_injection_en_campus_id():
    # Intento SQL injection via campus_id string (debe ser 422 por validación int)
    r = client.get("/api/publicaciones", params={"campus_id": "1; DROP TABLE publicaciones; --"})
    assert r.status_code == 422
    # Intento via servicios param con SQL
    r2 = client.get("/api/publicaciones", params={"campus_id": 1, "servicios": "1; DROP TABLE"})
    assert r2.status_code == 400

def test_sql_injection_en_filtros_servicios():
    # servicios con caracteres raros debe ser 400 no 500
    r = client.get("/api/publicaciones", params={"servicios": "1,2,3' OR '1'='1"})
    assert r.status_code == 400

def test_xss_en_titulo_no_ejecuta():
    # Intento XSS en titulo debe ser 422 si no cumple min_length o 201 pero guardado escapado
    # React escapa por defecto, backend debe almacenarlo como string sin ejecutar
    payload = {
        "titulo": "<script>alert(1)</script> XSS test largo suficiente",
        "descripcion": "Descripción válida con al menos veinte caracteres para test XSS",
        "tipo_inmueble": "APARTAESTUDIO",
        "canon_mensual": 500000,
        "deposito_requerido": 0,
        "zona_barrio_id": 1,
        "direccion_referencial": "Calle XSS # 1-10 referencia",
        "reglas_convivencia": "Reglas válidas con más de diez caracteres",
        "servicios_ids": [1],
        "campus_ids": [1],
        "fotos": [
            "https://a.com/1.jpg",
            "https://a.com/2.jpg",
            "https://a.com/3.jpg",
        ],
    }
    r = client.post("/api/publicaciones", json=payload, headers={"Authorization": "Bearer mock-token-arrendador"})
    # Debe ser 201 (Pydantic permite <script> como string) pero no debe romper
    assert r.status_code in (201, 422)
    if r.status_code == 201:
        # Verifica que no se ejecuta, solo se guarda
        data = r.json()
        assert data["estado"].startswith("PENDIENTE")

def test_servicios_param_demasiado_largo_400():
    long_serv = ",".join(["1"]*20)  # 20 ids > limit 10
    r = client.get("/api/publicaciones", params={"servicios": long_serv})
    assert r.status_code == 400

def test_precio_muy_grande_422():
    r = client.get("/api/publicaciones", params={"precio_min": 9999999999})
    assert r.status_code == 422

def test_campus_id_fuera_rango_422():
    r = client.get("/api/publicaciones", params={"campus_id": 99999})
    # 99999 <=1000? No, 99999 >1000 + le=1000 → 422
    assert r.status_code == 422
    r2 = client.get("/api/publicaciones", params={"campus_id": 0})
    assert r2.status_code == 422

def test_no_expone_password_hash():
    r = client.get("/api/publicaciones/1")
    assert r.status_code == 200
    body = str(r.json()).lower()
    assert "password" not in body
    assert "hash" not in body

def test_health_no_sensible():
    r = client.get("/health")
    assert r.status_code == 200
    assert "password" not in str(r.json()).lower()
    assert "secret" not in str(r.json()).lower()

# --- OLA5-M7: CSP + Permissions-Policy + request_id + handler global ---

def test_csp_base_en_api():
    r = client.get("/health")
    csp = r.headers.get("content-security-policy", "")
    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "unsafe-inline" not in csp

def test_csp_docs_permite_swagger():
    r = client.get("/docs")
    assert r.status_code == 200
    csp = r.headers.get("content-security-policy", "")
    assert "cdn.jsdelivr.net" in csp  # JS/CSS de Swagger UI

def test_permissions_policy():
    r = client.get("/health")
    pp = r.headers.get("permissions-policy", "")
    assert "camera=()" in pp and "microphone=()" in pp and "geolocation=()" in pp

def test_request_id_in_out():
    r = client.get("/health")
    rid = r.headers.get("x-request-id")
    assert rid, "toda respuesta debe traer X-Request-ID"
    r2 = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert r2.headers.get("x-request-id") == "abc123"  # se propaga el del cliente

def test_handler_global_pasa_http_exception_intacta():
    # El handler de Exception NO debe tragarse 401/404 (contrato API intacto).
    import asyncio
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app.main import unhandled_exception_handler

    req = SimpleNamespace(state=SimpleNamespace(request_id="t1"), url=SimpleNamespace(path="/x"))
    resp = asyncio.run(unhandled_exception_handler(req, HTTPException(status_code=404, detail="Nope")))
    assert resp.status_code == 404
    import json
    assert json.loads(resp.body) == {"detail": "Nope"}

def test_handler_global_500_con_request_id():
    import asyncio
    import json
    from types import SimpleNamespace
    from app.main import unhandled_exception_handler

    req = SimpleNamespace(state=SimpleNamespace(request_id="t500"), url=SimpleNamespace(path="/boom"))
    resp = asyncio.run(unhandled_exception_handler(req, RuntimeError("boom")))
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body["request_id"] == "t500"
    assert "boom" not in str(body)  # sin filtrar trazas al cliente
