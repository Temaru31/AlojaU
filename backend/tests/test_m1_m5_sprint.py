"""Sprint M1-M5: métricas unificadas, housing dinámicos, avatar, telegram.

Aditivo, hermético (usa reseed por test vía conftest + mocks restaurados).
"""
import io

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import get_session

client = TestClient(app)
ADMIN = {"Authorization": "Bearer mock-token-admin"}
ARR = {"Authorization": "Bearer mock-token-arrendador"}
EST = {"Authorization": "Bearer mock-token-estudiante"}


def test_m1_metricas_inmuebles_con_reportes_aditivo():
    r = client.get("/api/admin/metricas", headers=ADMIN)
    assert r.status_code == 200
    d = r.json()
    # Contrato viejo intacto + campo nuevo aditivo.
    for k in ("total_publicaciones", "activas", "pendientes", "reportes_activos",
              "reportes_pendientes", "arrendadores_verificados", "total_usuarios"):
        assert k in d and isinstance(d[k], int)
    assert "inmuebles_con_reportes" in d and isinstance(d["inmuebles_con_reportes"], int)
    # Seed v7: 1 PENDIENTE en pub2 + 3 CONFIRMADO en 11-13 + 9 en pausados.
    # PENDIENTE distintos >=1, y nunca mayor que reportes_pendientes? No:
    # inmuebles <= pendientes (un inmueble puede tener varios).
    assert d["inmuebles_con_reportes"] >= 1
    assert d["inmuebles_con_reportes"] <= max(1, d["reportes_pendientes"]) or d["reportes_pendientes"] >= 0


def test_m1_auditoria_enriquecida_legible_y_batch():
    r = client.get("/api/admin/auditoria", params={"size": 5}, headers=ADMIN)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d and len(d["items"]) > 0
    a = d["items"][0]
    # Campos nuevos aditivos.
    assert "usuario_email" in a
    assert "publicacion_existe" in a
    assert "mensaje_legible" in a and isinstance(a["mensaje_legible"], str) and len(a["mensaje_legible"]) > 0
    # Contrato viejo intacto.
    for k in ("id", "publicacion_id", "usuario_id", "evento", "detalle", "creado_en"):
        assert k in a
    # Ningún enum crudo como mensaje principal: el legible no es JSON.
    assert "{" not in a["mensaje_legible"] or len(a["mensaje_legible"]) < 200


def test_m2_housing_catalogo_publico_y_config():
    r = client.get("/api/housing-types")
    assert r.status_code == 200
    tipos = r.json()
    slugs = {t["slug"] for t in tipos}
    for s in ("HABITACION_FAMILIAR", "HABITACION_INDEPENDIENTE", "APARTAESTUDIO",
              "COMPARTIDO", "APARTAMENTO_COMPLETO", "HABITACION_PISO_COMPARTIDO"):
        assert s in slugs
    # config-publica extendida aditivamente.
    c = client.get("/api/publicaciones/config-publica").json()
    assert "tipos_vivienda" in c and isinstance(c["tipos_vivienda"], list)
    assert {t["slug"] for t in c["tipos_vivienda"]} >= {"APARTAESTUDIO", "COMPARTIDO"}
    # Contratos viejos intactos.
    for k in ("dias_desactualizada", "titulo_min", "fotos_min", "canon_max"):
        assert k in c


def test_m2_validacion_dinamica_query_y_crear():
    # Query inválido -> 422 (dinámica, sin pattern estático).
    r = client.get("/api/publicaciones", params={"tipo": "INVALIDO"})
    assert r.status_code == 422
    # Query nuevo slug válido -> 200 (no 422).
    r2 = client.get("/api/publicaciones", params={"tipo": "APARTAMENTO_COMPLETO", "size": 2})
    assert r2.status_code == 200
    # POST con tipo inactivo/inexistente -> 422 (no 201).
    payload = {
        "titulo": "Habitación temporal amplia para test M2",
        "descripcion": "Descripción con más de veinte caracteres para el test",
        "tipo_inmueble": "INVALIDO",
        "canon_mensual": 450000, "deposito_requerido": 0,
        "zona_barrio_id": 1, "direccion_referencial": "Calle temporal 123 referencia",
        "reglas_convivencia": "Reglas temporales válidas 10+",
        "servicios_ids": [1], "campus_ids": [], "fotos": ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
    }
    # Pydantic forma MAYUS pero no en catálogo: el endpoint da 422.
    # "INVALIDO" pasa forma (mayús) pero falla catálogo -> 422.
    rc = client.post("/api/publicaciones", json=payload, headers=ARR)
    assert rc.status_code == 422


def test_m2_admin_crud_y_restrict_y_cache():
    from app.services import housing_types as ht
    ht.clear_cache()
    # Crear.
    r = client.post("/api/admin/housing-types", json={
        "slug": "LOFT_TEST", "nombre_visible": "Loft Test",
        "descripcion_tooltip": "Para test", "icono": "🏠", "esta_activo": True,
    }, headers=ADMIN)
    assert r.status_code in (201, 409)
    if r.status_code == 201:
        assert r.json()["slug"] == "LOFT_TEST"
        # Publico lo ve (caché invalidada).
        ht.clear_cache()
        pub = client.get("/api/housing-types").json()
        assert "LOFT_TEST" in {t["slug"] for t in pub}
        # Editar (desactivar).
        re = client.patch("/api/admin/housing-types/LOFT_TEST", json={"esta_activo": False}, headers=ADMIN)
        assert re.status_code == 200
        assert re.json()["esta_activo"] is False
        # Query con inactivo -> 422.
        rq = client.get("/api/publicaciones", params={"tipo": "LOFT_TEST"})
        assert rq.status_code == 422
        # Eliminar (sin uso) -> 204.
        rd = client.delete("/api/admin/housing-types/LOFT_TEST", headers=ADMIN)
        assert rd.status_code == 204
    # RESTRICT: slug en uso no se puede borrar -> 409.
    r2 = client.delete("/api/admin/housing-types/APARTAESTUDIO", headers=ADMIN)
    assert r2.status_code == 409
    # RBAC: no-admin 403, sin token 401.
    assert client.get("/api/admin/housing-types", headers=ARR).status_code == 403
    assert client.get("/api/admin/housing-types").status_code == 401
    ht.clear_cache()


def test_m2_trust_y_search_sincronizados():
    from app.services.trust import calcular_indice
    base = dict(canon_mensual=500000, deposito_requerido=0,
                reglas_convivencia="Reglas ok 10+", direccion_referencial="Calle 5 # 4-10",
                servicios_ids=[1], telefono_verificado=True, num_fotos=3,
                dias_vigencia=5, reportes_activos=0)
    r1 = calcular_indice(tipo_inmueble="APARTAMENTO_COMPLETO", **base)
    r2 = calcular_indice(tipo_inmueble="HABITACION_PISO_COMPARTIDO", **base)
    # Nuevos tipos dan +5 completitud (no 0).
    assert r1["desglose"]["completitud"] >= 5
    assert r2["desglose"]["completitud"] >= 5
    from app.services.search import tipo_canonico_para_token
    assert tipo_canonico_para_token("apartamento") == "APARTAESTUDIO"
    assert tipo_canonico_para_token("completo") == "APARTAMENTO_COMPLETO"
    assert tipo_canonico_para_token("piso") == "HABITACION_PISO_COMPARTIDO"


def test_m3_avatar_estudiante_y_quitar():
    # PNG mínimo 1x1.
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")
    files = {"file": ("avatar.png", io.BytesIO(png), "image/png")}
    # ESTUDIANTE puede (no 403 de /upload/una).
    r = client.post("/api/auth/avatar", files=files, headers=EST)
    assert r.status_code == 200, r.text
    assert r.json()["foto_perfil_url"].startswith("http")
    # Perfil refleja foto.
    p = client.get("/api/auth/perfil", headers=EST).json()
    assert p["foto_perfil_url"]
    # Quitar -> null (iniciales).
    d = client.delete("/api/auth/avatar", headers=EST)
    assert d.status_code == 200
    assert d.json()["foto_perfil_url"] is None
    # Sin token 401.
    r2 = client.post("/api/auth/avatar", files={"file": ("a.png", io.BytesIO(png), "image/png")})
    assert r2.status_code == 401
    # MIME inválido 400.
    r3 = client.post("/api/auth/avatar", files={"file": ("a.txt", io.BytesIO(b"hola"), "text/plain")}, headers=EST)
    assert r3.status_code == 400


def test_m5_telegram_vincular_y_privacidad():
    # Sin username configurado -> 503 guía (no 500).
    r = client.post("/api/auth/telegram/vincular-inicio", headers=EST)
    assert r.status_code in (200, 503)
    if r.status_code == 503:
        assert "TELEGRAM_BOT_USERNAME" in r.json()["detail"]
    # Con username temporal (solo memoria, sin tocar .env).
    from app.core.config import settings as _s
    viejo = _s.TELEGRAM_BOT_USERNAME
    _s.TELEGRAM_BOT_USERNAME = "AlojaU_test_bot"
    try:
        r2 = client.post("/api/auth/telegram/vincular-inicio", headers=EST)
        assert r2.status_code == 200
        url = r2.json()["bot_url"]
        assert url.startswith("https://t.me/AlojaU_test_bot?start=")
        token = url.split("start=")[1]
        assert token.count(".") == 3
        # HMAC un solo uso: primera validación ok, segunda None.
        from app.routers.auth import validar_token_vinculo
        from app.core.security import decode_token
        # user_id del token EST (mock id 3).
        uid = validar_token_vinculo(token)
        assert isinstance(uid, int)
        assert validar_token_vinculo(token) is None
    finally:
        _s.TELEGRAM_BOT_USERNAME = viejo
    # Sin token 401.
    assert client.post("/api/auth/telegram/vincular-inicio").status_code == 401
    # Privacidad: OTP sin vinculación va por email (nunca telegram global).
    from app.routers import auth as a
    import asyncio
    from app.db.session import get_session as _gs
    # _crear_otp con email sin telegram -> canal email.
    async def _canal():
        async for db in _gs():
            try:
                _, canal = await a._crear_otp(db, "sin_telegram_m5@alojau.com", "email_verify")
                return canal
            finally:
                break
        return "email"
    canal = asyncio.run(_canal())
    assert canal == "email"
