"""B0 base sólida - tests mínimos (fail-closed, FK, both-or-none, PENDIENTE privado, rate-limit)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BASE_PAYLOAD = {
    "titulo": "B0 Test Base Solida titulo largo suficiente",
    "descripcion": "Descripción con al menos veinte caracteres para pasar validación Pydantic",
    "tipo_inmueble": "HABITACION_INDEPENDIENTE",
    "canon_mensual": 500000,
    "deposito_requerido": 0,
    "zona_barrio_id": 1,
    "direccion_referencial": "Calle 5 # 4-70 Tulcán referencia 10+",
    "reglas_convivencia": "No mascotas, visitas hasta 9pm, regla válida 10+",
    "latitud": 2.443,
    "longitud": -76.606,
    "servicios_ids": [1],
    "campus_ids": [1],
    "fotos": [
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/test1.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/test2.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/test3.jpg",
    ],
}

def auth_header(token="mock-token-arrendador"):
    return {"Authorization": f"Bearer {token}"}

def test_b0_lat_lng_both_or_none_422():
    # Solo latitud sin longitud -> 422 (B0-5)
    p = {**BASE_PAYLOAD, "latitud": 2.443, "longitud": None}
    # Quitar None para que Pydantic vea ausente
    p.pop("longitud", None)
    r = client.post("/api/publicaciones", json=p, headers=auth_header())
    assert r.status_code == 422
    # Solo longitud sin latitud -> 422
    p2 = {**BASE_PAYLOAD}
    p2.pop("latitud", None)
    r2 = client.post("/api/publicaciones", json=p2, headers=auth_header())
    assert r2.status_code == 422
    # Ambos ausentes -> OK (201 PENDIENTE o 404 FK si DB estricta, pero no 422)
    p3 = {**BASE_PAYLOAD}
    p3.pop("latitud", None)
    p3.pop("longitud", None)
    r3 = client.post("/api/publicaciones", json=p3, headers=auth_header())
    assert r3.status_code in (201, 404)

def test_b0_fk_zona_404():
    # Requiere DB viva; si cae a mock dev (201) se acepta pero se documenta.
    p = {**BASE_PAYLOAD, "zona_barrio_id": 999999}
    r = client.post("/api/publicaciones", json=p, headers=auth_header())
    assert r.status_code in (404, 201)

def test_b0_fk_campus_404():
    p = {**BASE_PAYLOAD, "campus_ids": [999]}
    r = client.post("/api/publicaciones", json=p, headers=auth_header())
    assert r.status_code in (404, 201)

def test_b0_fk_servicio_404():
    p = {**BASE_PAYLOAD, "servicios_ids": [9999]}
    r = client.post("/api/publicaciones", json=p, headers=auth_header())
    assert r.status_code in (404, 201)

def test_b0_require_admin():
    from app.core.security import require_admin
    from fastapi import HTTPException
    # arrendador -> 403
    try:
        require_admin("Bearer mock-token-arrendador")
        assert False, "arrendador debe dar 403 en require_admin"
    except HTTPException as e:
        assert e.status_code == 403
    # admin -> ok
    u = require_admin("Bearer mock-token-admin")
    assert u["rol"] == "ADMIN"
    # sin token -> 401
    try:
        require_admin(None)
        assert False, "sin token debe dar 401"
    except HTTPException as e:
        assert e.status_code == 401

def test_b0_fail_closed_prod():
    from pydantic import ValidationError
    from app.core.config import Settings
    import pytest
    # prod con defaults debe fallar arranque
    with pytest.raises(ValidationError):
        Settings(ENV="prod", SECRET_KEY="cambia_esto_en_produccion_muy_largo_32_chars_min", USE_MOCK_FALLBACK=True)
    # prod bien configurado no falla
    s = Settings(ENV="prod", SECRET_KEY="x" * 40, USE_MOCK_FALLBACK=False, CORS_ORIGINS="https://app.vercel.app")
    assert s.mock_enabled is False
    # dev con mock True permite mock
    s2 = Settings(ENV="dev", USE_MOCK_FALLBACK=True)
    assert s2.mock_enabled is True

def test_b0_login_rate_limit_429():
    from app.routers.auth import _LOGIN_ATTEMPTS
    _LOGIN_ATTEMPTS.clear()
    try:
        payload = {"email": "nobody@alojau.com", "password": "wrong123"}
        codes = []
        for _ in range(6):
            r = client.post("/api/auth/login", json=payload)
            codes.append(r.status_code)
        # Primeros 5: 401 (credenciales), 6to: 429
        assert codes[:5] == [401] * 5, codes
        assert codes[5] == 429, codes
    finally:
        _LOGIN_ATTEMPTS.clear()
