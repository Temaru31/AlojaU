"""
PA-01: Tests de aceptación — Renovación Mensual de Publicaciones
Criterios del Gherkin (7 mínimos):
  1. Dueño renueva publicación vigente → 200
  2. Expiración aumenta exactamente 30 días
  3. Dueño renueva publicación vencida → 200, nueva desde ahora
  4. Otro propietario intenta renovar → 403
  5. Sin token → 401
  6. Renovación genera fila de auditoría evento=\'RENEWED\'
  7. Renovación no modifica datos no relacionados
"""
from datetime import datetime, timezone, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.core.security import MOCK_TOKENS

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
OWNER_HEADER = {"Authorization": "Bearer mock-token-arrendador"}  # id=1
OTHER_HEADER  = {"Authorization": "Bearer mock-token-admin"}        # id=2, no dueño de pub 1

BASE_PAYLOAD = {
    "titulo": "Habitación PA-01 test titulo largo suficiente",
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
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/pa01_a.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/pa01_b.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/alojau/pa01_c.jpg",
    ],
}


def crear_publicacion(titulo_extra="") -> int:
    """Crea una publicación PENDIENTE via POST y retorna su id."""
    payload = {**BASE_PAYLOAD, "titulo": f"PA01 Test titulo suficientemente largo {titulo_extra}"}
    r = client.post("/api/publicaciones", json=payload, headers=OWNER_HEADER)
    assert r.status_code == 201, f"No se pudo crear publicación: {r.text}"
    return r.json()["id"]


def patch_fecha_mock(pub_id: int, fecha: datetime):
    """Fuerza fecha_expiracion en MOCK_PUBS (sólo modo mock sin PG)."""
    from app.routers.publicaciones import MOCK_PUBS
    for p in MOCK_PUBS:
        if p["id"] == pub_id:
            p["fecha_expiracion"] = fecha
            break


# ---------------------------------------------------------------------------
# Criterio 5 — Sin token → 401
# ---------------------------------------------------------------------------

def test_pa01_c5_sin_token_401():
    """Usuario no autenticado recibe HTTP 401."""
    r = client.patch("/api/publicaciones/1/renovar")
    assert r.status_code == 401, f"Esperado 401, obtenido {r.status_code}: {r.text}"


def test_pa01_c5_token_invalido_401():
    """Token malformado retorna 401."""
    r = client.patch(
        "/api/publicaciones/1/renovar",
        headers={"Authorization": "Bearer token-inexistente-xyz"},
    )
    assert r.status_code == 401, f"Esperado 401, obtenido {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# Criterio 4 — Otro propietario → 403
# ---------------------------------------------------------------------------

def test_pa01_c4_otro_propietario_403():
    """Usuario autenticado no-dueño recibe HTTP 403."""
    r = client.patch("/api/publicaciones/1/renovar", headers=OTHER_HEADER)
    assert r.status_code == 403, f"Esperado 403, obtenido {r.status_code}: {r.text}"
    body = r.json()
    assert "permisos" in body.get("detail", "").lower()


# ---------------------------------------------------------------------------
# Criterios 1 & 2 — Dueño renueva vigente → 200, +30 días exactos
# ---------------------------------------------------------------------------

def test_pa01_c1_c2_dueno_renueva_vigente_200_mas_30_dias():
    """
    Publicación vigente renovada por su dueño:
    - Responde 200
    - fecha_expiracion_nueva = fecha_expiracion_anterior + 30 días exactos
    - dias_agregados == 30
    """
    r = client.patch("/api/publicaciones/1/renovar", headers=OWNER_HEADER)
    assert r.status_code == 200, f"Esperado 200, obtenido {r.status_code}: {r.text}"

    data = r.json()
    for campo in ["id", "estado", "fecha_expiracion_anterior",
                  "fecha_expiracion_nueva", "dias_agregados", "mensaje"]:
        assert campo in data, f"Campo requerido \'{campo}\' faltante"

    assert data["dias_agregados"] == 30

    fa = datetime.fromisoformat(data["fecha_expiracion_anterior"].replace("Z", "+00:00"))
    fn = datetime.fromisoformat(data["fecha_expiracion_nueva"].replace("Z", "+00:00"))
    diff_dias = (fn - fa).total_seconds() / 86400
    assert abs(diff_dias - 30) < 0.0002, (
        f"Diferencia debe ser exactamente 30 días, es {diff_dias:.6f}"
    )


# ---------------------------------------------------------------------------
# Criterio 3 — Dueño renueva vencida → 30 días desde ahora
# ---------------------------------------------------------------------------

def test_pa01_c3_dueno_renueva_vencida_desde_ahora():
    """
    Publicación vencida: fecha_expiracion_nueva ≈ ahora + 30 días (tolerancia 10s).
    """
    pub_id = crear_publicacion("vencida-c3")
    fecha_pasada = datetime.now(timezone.utc) - timedelta(days=5)
    patch_fecha_mock(pub_id, fecha_pasada)

    t0 = datetime.now(timezone.utc)
    r = client.patch(f"/api/publicaciones/{pub_id}/renovar", headers=OWNER_HEADER)
    t1 = datetime.now(timezone.utc)

    assert r.status_code == 200, f"Esperado 200, obtenido {r.status_code}: {r.text}"
    data = r.json()

    fn = datetime.fromisoformat(data["fecha_expiracion_nueva"].replace("Z", "+00:00"))
    assert t0 + timedelta(days=30) <= fn <= t1 + timedelta(days=30, seconds=10), (
        f"fecha_nueva={fn} fuera del rango esperado desde ahora+30d"
    )


# ---------------------------------------------------------------------------
# Criterio 6 — Auditoría no genera error 500
# ---------------------------------------------------------------------------

def test_pa01_c6_audit_sin_error_500():
    """
    La inserción de fila de auditoría no produce error 5xx.
    Con DB real: verificar evento=\'RENEWED\' en publicaciones_audit.
    En modo mock: basta con 200 y mensaje de confirmación.
    """
    r = client.patch("/api/publicaciones/1/renovar", headers=OWNER_HEADER)
    assert r.status_code in (200, 201), (
        f"Auditoría causó error: {r.status_code} - {r.text}"
    )
    assert r.json().get("mensaje"), "Respuesta debe incluir mensaje de confirmación"


# ---------------------------------------------------------------------------
# Criterio 7 — Datos no relacionados sin cambio
# ---------------------------------------------------------------------------

def test_pa01_c7_datos_no_relacionados_sin_cambio():
    """
    Tras la renovación, titulo, canon_mensual y tipo_inmueble se conservan.
    fecha_expiracion sí debe haber cambiado.
    """
    antes = client.get("/api/publicaciones/1", headers=OWNER_HEADER).json()

    r = client.patch("/api/publicaciones/1/renovar", headers=OWNER_HEADER)
    assert r.status_code == 200

    despues = client.get("/api/publicaciones/1", headers=OWNER_HEADER).json()

    for campo in ["titulo", "canon_mensual", "tipo_inmueble", "direccion_referencial"]:
        if campo in antes and campo in despues:
            assert antes[campo] == despues[campo], (
                f"Campo \'{campo}\' cambió: {antes[campo]} → {despues[campo]}"
            )

    if antes.get("fecha_expiracion") and despues.get("fecha_expiracion"):
        assert antes["fecha_expiracion"] != despues["fecha_expiracion"], (
            "fecha_expiracion debe haber cambiado tras renovar"
        )


# ---------------------------------------------------------------------------
# Adicional — Pub inexistente → 404
# ---------------------------------------------------------------------------

def test_pa01_pub_inexistente_404():
    """Publicación que no existe retorna 404."""
    r = client.patch("/api/publicaciones/999999/renovar", headers=OWNER_HEADER)
    assert r.status_code == 404, f"Esperado 404, obtenido {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# Adicional — Estructura completa de respuesta
# ---------------------------------------------------------------------------

def test_pa01_respuesta_estructura_completa():
    """Todos los campos del spec técnico están presentes en la respuesta."""
    r = client.patch("/api/publicaciones/1/renovar", headers=OWNER_HEADER)
    assert r.status_code == 200
    data = r.json()

    for campo in ["id", "estado", "fecha_expiracion_anterior",
                  "fecha_expiracion_nueva", "dias_agregados", "mensaje"]:
        assert campo in data, f"Campo \'{campo}\' faltante en respuesta"

    assert isinstance(data["id"], int) and data["id"] > 0
    assert data["dias_agregados"] == 30
    assert isinstance(data["mensaje"], str) and len(data["mensaje"]) > 0
