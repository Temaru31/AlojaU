"""Fase 1 chatbot: capa de datos de solo lectura (mig 021 + rol chatbot_ro).

- Sin PG: los tests de integración se omiten (suite en modo mock); los de
  archivo (migración/espejo/schema) corren siempre.
- Con PG: exigen 021 aplicada (si el rol/vistas faltan = drift, FALLAN, no se
  omiten), verifican SELECT en vistas, denegación de escritura/DDL/lectura de
  tablas base con SET ROLE, ausencia de PII en vistas, solo-ACTIVO y las
  funciones de `readonly_queries` (que NUNCA tocan la sesión principal).
"""
import asyncio
import os
import pathlib

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
MIG_021 = REPO / "db" / "migrations" / "021_chatbot_readonly.sql"
ALEMBIC_021 = REPO / "alembic" / "versions" / "021_chatbot_readonly.py"
SCHEMA = REPO / "db" / "schema.sql"

VISTAS = [
    "chat_v_publicaciones",
    "chat_v_publicacion_servicios",
    "chat_v_publicacion_campus",
    "chat_v_imagenes",
    "chat_v_campus",
    "chat_v_ciudades",
    "chat_v_zonas",
    "chat_v_housing_types",
    "chat_v_servicios",
]

# Columnas que JAMÁS pueden aparecer en una vista del chatbot (PII/secretos).
COLUMNAS_PII = {
    "telefono_whatsapp", "email", "password_hash", "supabase_id",
    "ip_consentimiento", "telegram_chat_id", "codigo_hash", "token_hash",
    "jti", "user_agent", "ip", "marca", "chat_id_pendiente", "nonce",
    "clave", "exito", "preferencias", "bio", "foto_perfil_url",
    "acepto_tratamiento_datos", "fecha_consentimiento", "version_politica",
    "eliminado_en", "auth_provider", "email_verificado",
}

TABLAS_BASE_PROHIBIDAS = [
    "usuarios", "sesiones", "reportes_publicacion", "publicaciones_audit",
    "system_settings", "publicaciones", "otp_codes", "password_resets",
    "telegram_vinculos", "idempotency_keys", "notificaciones",
    "busquedas_guardadas",
]


def _dsn() -> str:
    raw = os.getenv(
        "DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    if "supabase.co" in raw.lower() or os.getenv("ENV", "dev").lower() == "prod":
        raise RuntimeError("NUNCA contra prod")
    # asyncpg no entiende el esquema +asyncpg (igual que conftest._dsn_test).
    from app.db.session import dsn_asyncpg_a_psycopg
    return dsn_asyncpg_a_psycopg(raw)


async def _pg_ok() -> bool:
    try:
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        await conn.close()
        return True
    except Exception:
        return False


async def _rol_aplicado() -> bool:
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        n = await conn.fetchval(
            "SELECT COUNT(*) FROM pg_roles WHERE rolname='chatbot_ro'")
        v = await conn.fetchval(
            "SELECT COUNT(*) FROM information_schema.views "
            "WHERE table_schema='public' AND table_name LIKE 'chat_v_%'")
        return bool(n) and int(v) >= len(VISTAS)
    finally:
        await conn.close()


def _requiere_pg(coro_fn):
    """Envuelve una corrutina: sin PG omite; con PG sin 021, falla (drift)."""
    async def _w():
        if not await _pg_ok():
            pytest.skip("sin PG local (modo mock)")
        if not await _rol_aplicado():
            pytest.fail("021 no aplicada en esta BD: aplica schema.sql + "
                        "migrations/*.sql en orden (ver scripts/verify_ci.sh)")
        return await coro_fn()
    return _w


# --------------------------------------------------------------------------
# Consistencia de archivos (siempre, sin PG)
# --------------------------------------------------------------------------

def test_021_contiene_rol_vistas_y_lockdown():
    sql = MIG_021.read_text(encoding="utf-8")
    assert "chatbot_ro" in sql
    for vista in VISTAS:
        assert vista in sql, f"{vista} ausente en 021"
    for pieza in ("security_barrier", "CONNECTION LIMIT 5",
                  "statement_timeout", "default_transaction_read_only",
                  "REVOKE ALL ON ALL TABLES", "GRANT SELECT",
                  "tiene_telefono", "num_fotos", "num_reportes_activos",
                  "005:system_settings", "uq_vista_pub_marca"):
        assert pieza in sql, f"{pieza} ausente en 021"


def test_021_sin_pii_en_texto():
    lineas = [ln for ln in
              MIG_021.read_text(encoding="utf-8").splitlines()
              if not ln.strip().startswith("--")]
    sql = "\n".join(lineas).lower()
    for col in ("telefono_whatsapp", "password_hash", "supabase_id",
                "telegram_chat_id", "codigo_hash", "token_hash"):
        assert f"as {col}" not in sql and f", {col}" not in sql, \
            f"021 expondría {col}"


def test_alembic_021_espeja_y_encadena():
    py = ALEMBIC_021.read_text(encoding="utf-8")
    assert "down_revision" in py and "020_notificacion_telegram" in py
    assert "revision" in py and "021_chatbot_readonly" in py
    for vista in VISTAS:
        assert vista in py, f"{vista} ausente en alembic 021"
    assert "chatbot_ro" in py


def test_schema_sql_incluye_021():
    schema = SCHEMA.read_text(encoding="utf-8")
    assert "chat_v_publicaciones" in schema
    assert "chatbot_ro" in schema
    cuerpo = MIG_021.read_text(encoding="utf-8")
    cuerpo = cuerpo[cuerpo.index("-- BLOQUE 0"):]
    assert cuerpo in schema, "schema.sql desfasado de 021"


def test_readonly_queries_solo_vistas_y_sin_sesion_principal():
    src = (REPO / "app" / "services" / "chat" / "readonly_queries.py"
           ).read_text(encoding="utf-8")
    assert "chat_v_" in src
    for prohibido in ("app.db.session", "app.repositories", "app.models",
                      "app.routers"):
        assert prohibido not in src, f"import prohibido: {prohibido}"


def test_nombres_vistas_coinciden_con_migracion():
    import sys
    sys.path.insert(0, str(REPO))
    try:
        from app.services.chat.readonly_queries import nombres_vistas
        assert set(nombres_vistas()) == set(VISTAS)
    finally:
        sys.path.remove(str(REPO))


def test_chat_session_fail_closed_sin_dsn():
    import sys
    sys.path.insert(0, str(REPO))
    try:
        import os
        from app.db import chat_session as chat_sesion
        viejo = os.environ.pop("CHAT_DATABASE_URL", None)
        try:
            chat_sesion.clear_chat_engine_for_tests()
            assert chat_sesion.chat_configurado() is False
            assert chat_sesion.chat_engine is None
            assert chat_sesion.ChatSession is None
        finally:
            if viejo is not None:
                os.environ["CHAT_DATABASE_URL"] = viejo
            chat_sesion.clear_chat_engine_for_tests()
    finally:
        sys.path.remove(str(REPO))


def test_chat_session_rechaza_dsn_invalida():
    import sys
    sys.path.insert(0, str(REPO))
    try:
        import os
        from unittest import mock
        from app.db import chat_session as chat_sesion
        with mock.patch.dict(os.environ,
                             {"CHAT_DATABASE_URL": "mysql://x/y"}):
            assert chat_sesion.chat_configurado() is False
        with mock.patch.dict(os.environ, {"CHAT_DATABASE_URL": (
            "postgresql+asyncpg://chatbot_ro.ref:secreto"
            "@aws-0-us-east-2.pooler.supabase.com:5432/postgres")}):
            assert chat_sesion.chat_configurado() is True
    finally:
        sys.path.remove(str(REPO))


def test_chat_get_session_responde_503_sin_configurar():
    import asyncio
    import sys
    sys.path.insert(0, str(REPO))
    try:
        import os
        from fastapi import HTTPException
        from app.db import chat_session as chat_sesion
        viejo = os.environ.pop("CHAT_DATABASE_URL", None)
        try:
            chat_sesion.clear_chat_engine_for_tests()
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_agotar(chat_sesion.get_chat_session()))
            assert exc.value.status_code == 503
        finally:
            if viejo is not None:
                os.environ["CHAT_DATABASE_URL"] = viejo
            chat_sesion.clear_chat_engine_for_tests()
    finally:
        sys.path.remove(str(REPO))


async def _agotar(gen):
    async for _ in gen:
        pass


def test_config_chat_apagado_por_defecto():
    import sys
    sys.path.insert(0, str(REPO))
    try:
        # Default declarado en el modelo (sin instanciar: ni backend/.env
        # local ni el entorno de desarrollo interfieren).
        from app.core.config import Settings
        assert Settings.model_fields["CHAT_ENABLED"].default is False
        assert Settings.model_fields["CHAT_DATABASE_URL"].default == ""
    finally:
        sys.path.remove(str(REPO))


# --------------------------------------------------------------------------
# Integración con PG (rol real; omiten sin PG)
# --------------------------------------------------------------------------

@_requiere_pg
async def flujo_rol_select_en_vistas_ok():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        await conn.execute("SET ROLE chatbot_ro")
        for vista in VISTAS:
            n = await conn.fetchval(f"SELECT COUNT(*) FROM {vista}")
            assert int(n) >= 0
    finally:
        await conn.close()


@_requiere_pg
async def flujo_rol_escritura_y_ddl_denegados():
    import asyncpg
    from asyncpg.exceptions import InsufficientPrivilegeError
    conn = await asyncpg.connect(_dsn())
    try:
        await conn.execute("SET ROLE chatbot_ro")
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(
                "INSERT INTO chat_v_ciudades(nombre, departamento) "
                "VALUES ('X', 'Y')")
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(
                "UPDATE chat_v_ciudades SET nombre='X' WHERE id=1")
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute("DELETE FROM chat_v_ciudades WHERE id=1")
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute("CREATE TABLE chat_evil(id INT)")
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(
                "INSERT INTO ciudades(nombre, departamento) VALUES ('X', 'Y')")
    finally:
        await conn.close()


@_requiere_pg
async def flujo_rol_sin_tablas_base():
    import asyncpg
    from asyncpg.exceptions import InsufficientPrivilegeError
    conn = await asyncpg.connect(_dsn())
    try:
        await conn.execute("SET ROLE chatbot_ro")
        for tabla in TABLAS_BASE_PROHIBIDAS:
            with pytest.raises(InsufficientPrivilegeError):
                await conn.fetch(f"SELECT * FROM {tabla} LIMIT 1")
    finally:
        await conn.close()


@_requiere_pg
async def flujo_rol_config_readonly_timeout_y_limite():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        cfg = await conn.fetchrow(
            "SELECT rolconnlimit, rolconfig FROM pg_roles "
            "WHERE rolname='chatbot_ro'")
        assert cfg["rolconnlimit"] == 5
        rolconfig = " ".join(cfg["rolconfig"] or [])
        assert "default_transaction_read_only=on" in rolconfig
        assert "statement_timeout" in rolconfig
    finally:
        await conn.close()


@_requiere_pg
async def flujo_vistas_sin_columnas_pii():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        for vista in VISTAS:
            cols = await conn.fetch(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=$1", vista)
            nombres = {c["column_name"] for c in cols}
            fuga = nombres & COLUMNAS_PII
            assert not fuga, f"{vista} expone PII: {fuga}"
        pubs = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' "
            "AND table_name='chat_v_publicaciones'")
        nombres = {c["column_name"] for c in pubs}
        for esperada in ("tiene_telefono", "num_fotos",
                         "num_reportes_activos", "zona_nombre",
                         "ciudad_nombre"):
            assert esperada in nombres, f"falta {esperada} en la vista"
    finally:
        await conn.close()


@_requiere_pg
async def flujo_vista_solo_activo_y_dueno_vivo():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        base = await conn.fetchval(
            "SELECT COUNT(*) FROM publicaciones p "
            "JOIN usuarios u ON u.id=p.usuario_id "
            "WHERE p.estado='ACTIVO' AND u.eliminado_en IS NULL")
        vista = await conn.fetchval("SELECT COUNT(*) FROM chat_v_publicaciones")
        assert int(vista) == int(base)
        assert int(vista) > 0, "seed sin ACTIVO: nada que auditar"
        no_activo = await conn.fetch(
            "SELECT id FROM publicaciones WHERE estado <> 'ACTIVO' LIMIT 5")
        for fila in no_activo:
            n = await conn.fetchval(
                "SELECT COUNT(*) FROM chat_v_publicaciones WHERE id=$1",
                fila["id"])
            assert int(n) == 0, f"id={fila['id']} no ACTIVO visible en la vista"
    finally:
        await conn.close()


@_requiere_pg
async def flujo_readonly_queries_sobre_rol():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        pubs = await conn.fetch(
            "SELECT * FROM chat_v_publicaciones ORDER BY id LIMIT 3")
        assert pubs, "sin filas ACTIVO para auditar queries"
        serv = await conn.fetch(
            "SELECT * FROM chat_v_publicacion_servicios "
            "WHERE publicacion_id=$1", pubs[0]["id"])
        assert isinstance(list(serv), list)
        camp = await conn.fetch(
            "SELECT * FROM chat_v_publicacion_campus "
            "WHERE publicacion_id=$1", pubs[0]["id"])
        assert isinstance(list(camp), list)
        fotos = await conn.fetch(
            "SELECT * FROM chat_v_imagenes WHERE publicacion_id=$1 "
            "ORDER BY orden", pubs[0]["id"])
        ordenes = [f["orden"] for f in fotos]
        assert ordenes == sorted(ordenes), "fotos sin orden de portada"
    finally:
        await conn.close()


@_requiere_pg
async def flujo_migracion_021_reaplicable():
    import asyncpg
    conn = await asyncpg.connect(_dsn())
    try:
        sql = MIG_021.read_text(encoding="utf-8")
        await conn.execute(sql)
        await conn.execute(sql)
    finally:
        await conn.close()


# Ejecución de los flujos async (patrón test_ci_directo_base: asyncio.run,
# sin TestClient). Cada test_pg_* omite sin PG o falla si falta la 021.
def _correr(coro_fn):
    return asyncio.run(coro_fn())


def test_pg_select_en_vistas_ok():
    _correr(flujo_rol_select_en_vistas_ok)


def test_pg_escritura_y_ddl_denegados():
    _correr(flujo_rol_escritura_y_ddl_denegados)


def test_pg_sin_tablas_base():
    _correr(flujo_rol_sin_tablas_base)


def test_pg_rol_config():
    _correr(flujo_rol_config_readonly_timeout_y_limite)


def test_pg_vistas_sin_pii():
    _correr(flujo_vistas_sin_columnas_pii)


def test_pg_vista_solo_activo():
    _correr(flujo_vista_solo_activo_y_dueno_vivo)


def test_pg_readonly_queries_sobre_rol():
    _correr(flujo_readonly_queries_sobre_rol)


def test_pg_migracion_reaplicable():
    _correr(flujo_migracion_021_reaplicable)
