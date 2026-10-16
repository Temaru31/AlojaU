"""Fase 2: tools del chatbot sobre vistas (PG) + validación (sin PG).

- Rechazos (allowlist/Pydantic): sin PG.
- Ejecución real: con PG (omitidos sin PG), siempre contra vistas chat_v_*.
"""
import asyncio

import pytest

from app.services.chat.tools import ToolRechazada, ejecutar_tool


def _correr(coro):
    return asyncio.run(coro)


async def _pg_ok() -> bool:
    import os
    from app.db.session import dsn_asyncpg_a_psycopg
    raw = os.getenv(
        "DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    try:
        import asyncpg
        conn = await asyncpg.connect(dsn_asyncpg_a_psycopg(raw))
        await conn.close()
        return True
    except Exception:
        return False


async def _sesion_pg():
    from app.db.session import AsyncSession
    return AsyncSession()


def test_tool_desconocida_rechazada_sin_efectos():
    async def _main():
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "ejecutar_consulta", {"sql": "SELECT 1"})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "moderar", {})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "", {})
    _correr(_main())


def test_tool_args_extra_y_tipos_rechazados():
    async def _main():
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "buscar_publicaciones",
                                {"q": "x", "DROP": "TABLE"})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "obtener_publicacion",
                                {"pub_id": "1; DROP TABLE publicaciones"})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "obtener_publicacion", {"pub_id": -5})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "listar_catalogos",
                                {"catalogo": "usuarios"})
        with pytest.raises(ToolRechazada):
            await ejecutar_tool(None, "buscar_en_faq", {"pregunta": "x"})
    _correr(_main())


def test_tools_requieren_pg_para_datos():
    async def _main():
        if not await _pg_ok():
            pytest.skip("sin PG local (modo mock)")
        db = await _sesion_pg()
        try:
            r = await ejecutar_tool(db, "buscar_publicaciones", {})
            assert isinstance(r["resultados"], list)
            assert len(r["resultados"]) <= 5
            for item in r["resultados"]:
                assert set(item) <= {
                    "id", "titulo", "tipo_inmueble", "canon_mensual",
                    "zona_nombre", "ciudad_nombre", "distancia_m",
                    "tiene_telefono", "num_fotos", "indice_confianza",
                    "nivel_confianza"}
                assert "telefono_whatsapp" not in item
                assert "email" not in item
        finally:
            await db.close()
    _correr(_main())


def test_obtener_invisible_fuera_de_activo():
    async def _main():
        if not await _pg_ok():
            pytest.skip("sin PG local (modo mock)")
        db = await _sesion_pg()
        try:
            from sqlalchemy import text as _t
            fila = (await db.execute(_t(
                "SELECT id FROM publicaciones WHERE estado <> 'ACTIVO' "
                "LIMIT 1"))).first()
            assert fila, "seed sin no-ACTIVO"
            r = await ejecutar_tool(
                db, "obtener_publicacion", {"pub_id": int(fila[0])})
            assert r == {"encontrada": False}
            r2 = await ejecutar_tool(
                db, "obtener_publicacion", {"pub_id": 999999})
            assert r2 == {"encontrada": False}
        finally:
            await db.close()
    _correr(_main())


def test_confianza_y_faq():
    async def _main():
        if not await _pg_ok():
            pytest.skip("sin PG local (modo mock)")
        db = await _sesion_pg()
        try:
            r = await ejecutar_tool(db, "buscar_en_faq",
                                    {"pregunta": "cómo funciona la confianza"})
            assert r["fragmentos"]
            assert all("fragmento" in f for f in r["fragmentos"])
            b = await ejecutar_tool(db, "buscar_publicaciones", {})
            assert b["resultados"], "seed sin ACTIVO"
            pid = b["resultados"][0]["id"]
            c = await ejecutar_tool(
                db, "explicar_indice_confianza", {"pub_id": pid})
            assert c["encontrada"] is True
            assert 0 <= c["indice"] <= 100
            assert "disclaimer" in c and c["disclaimer"]
            d = await ejecutar_tool(
                db, "obtener_publicacion", {"pub_id": pid})
            assert d["encontrada"] is True
            assert len(d["descripcion"]) <= 600
            assert "telefono_whatsapp" not in d
            cat = await ejecutar_tool(
                db, "listar_catalogos", {"catalogo": "tipos"})
            assert cat["tipos"]
        finally:
            await db.close()
    _correr(_main())
