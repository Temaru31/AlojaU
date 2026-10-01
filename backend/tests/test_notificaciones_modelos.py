"""Fase 1: modelos + migración 019 (tablas, CHECKs, UNIQUE evento_id).

- El espejo SQL (db/migrations/019_*.sql, lo que se aplica en Supabase) se
  ejecuta de verdad: upgrade crea tablas/índices, downgrade los revierte.
- El ORM crea, viola CHECK/UNIQUE a propósito y respeta defaults.
- Sin PG real (DSN supabase) los tests vivos se omiten; los file-level corren.
"""
import asyncio
import os
import pathlib

import pytest
from sqlalchemy.exc import IntegrityError

REPO = pathlib.Path(__file__).resolve().parent.parent  # backend/
MIRROR = REPO / "db" / "migrations" / "019_notificaciones_y_busquedas.sql"
MIG_019 = REPO / "alembic" / "versions" / "019_notificaciones_y_busquedas.py"


def _dsn():
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    from app.db.session import dsn_asyncpg_a_psycopg
    return dsn_asyncpg_a_psycopg(raw)


def _pg():
    return "supabase.co" not in _dsn().lower()


def _sentencias(bloque: str) -> list:
    """Divide SQL en statements ejecutables (sin comentarios sueltos)."""
    out = []
    for chunk in bloque.split(";"):
        lineas = [ln for ln in chunk.splitlines()
                  if ln.strip() and not ln.strip().startswith("--")]
        stmt = "\n".join(lineas).strip()
        if stmt:
            out.append(stmt)
    return out


def _upgrade_sql() -> list:
    texto = MIRROR.read_text(encoding="utf-8")
    return _sentencias(texto.split("-- DOWNGRADE")[0])


def _downgrade_sql() -> list:
    texto = MIRROR.read_text(encoding="utf-8")
    partes = texto.split("-- DOWNGRADE")
    assert len(partes) == 2, "bloque DOWNGRADE ausente en el espejo 019"
    # La primera línea es el resto de la cabecera ("(revertir Fase 1...)"),
    # no SQL: se descarta; el resto son DROP comentados que se des-comentan.
    lineas = partes[1].splitlines()[1:]
    cuerpo = "\n".join(
        ln[2:] if ln.strip().startswith("--") else ln
        for ln in lineas
    )
    stmts = _sentencias(cuerpo)
    assert stmts, "downgrade vacío en el espejo 019"
    return stmts


async def _ejecutar(stmts):
    import asyncpg
    conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
    try:
        for s in stmts:
            await conn.execute(s)
    finally:
        await conn.close()


@pytest.fixture()
def tablas():
    if not _pg():
        pytest.skip("sin PG real")
    asyncio.run(_ejecutar(_upgrade_sql()))
    yield
    asyncio.run(_ejecutar(_downgrade_sql()))


# --- Espejo: upgrade crea, downgrade revierte --------------------------------
def test_mirror_upgrade_crea_tablas_e_indices(tablas):
    async def _go():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            tablas_hay = await conn.fetch(
                "SELECT tablename FROM pg_tables WHERE tablename IN "
                "('busquedas_guardadas','notificaciones')")
            idx = await conn.fetch(
                "SELECT indexname FROM pg_indexes WHERE indexname IN "
                "('idx_bg_matching','idx_notif_bandeja','idx_notif_noleidas')")
            return {r["tablename"] for r in tablas_hay}, {r["indexname"] for r in idx}
        finally:
            await conn.close()
    hay_t, hay_i = asyncio.run(_go())
    assert hay_t == {"busquedas_guardadas", "notificaciones"}
    assert hay_i == {"idx_bg_matching", "idx_notif_bandeja", "idx_notif_noleidas"}


def test_mirror_downgrade_limpio(tablas):
    # Revertir dos veces no falla (idempotente) y deja todo limpio.
    asyncio.run(_ejecutar(_downgrade_sql()))

    async def _go():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            n = await conn.fetchval(
                "SELECT count(*) FROM pg_tables WHERE tablename IN "
                "('busquedas_guardadas','notificaciones')")
            return n
        finally:
            await conn.close()
    assert asyncio.run(_go()) == 0


def test_alembic_019_encadena_y_cubre_downgrade():
    mig = MIG_019.read_text(encoding="utf-8")
    assert "revision" in mig and "019_notificaciones_y_busquedas" in mig
    assert "down_revision" in mig and "018_telegram_contacto" in mig
    assert "def upgrade" in mig and "def downgrade" in mig
    for pieza in ("busquedas_guardadas", "notificaciones", "idx_bg_matching",
                  "idx_notif_bandeja", "idx_notif_noleidas",
                  "uq_notif_usuario_evento"):
        assert pieza in mig, f"{pieza} ausente en la migración 019"


# --- ORM ----------------------------------------------------------------------
def _nueva_sesion():
    from app.db.session import AsyncSession
    return AsyncSession()


def test_orm_inserta_con_defaults(tablas):
    from app.models import BusquedaGuardada, Notificacion

    async def _go():
        async with _nueva_sesion() as db:
            b = BusquedaGuardada(usuario_id=1, precio_min=300000,
                                 precio_max=600000, servicios_ids=[1, 4])
            db.add(b)
            await db.flush()
            assert b.id is not None
            assert b.activa is True
            assert b.servicios_ids == [1, 4]
            n = Notificacion(usuario_id=1, busqueda_id=b.id,
                             evento_id="nuevo_arriendo:1",
                             tipo="nuevo_arriendo", titulo="Aviso de prueba")
            db.add(n)
            await db.flush()
            assert n.leida is False
            assert n.canal == "app"
            assert n.cuerpo == ""
            await db.rollback()
    asyncio.run(_go())


def test_orm_check_rango_rechaza_min_mayor(tablas):
    from app.models import BusquedaGuardada

    async def _go():
        async with _nueva_sesion() as db:
            db.add(BusquedaGuardada(usuario_id=1, precio_min=600000,
                                    precio_max=100000))
            with pytest.raises(IntegrityError):
                await db.commit()
            await db.rollback()
    asyncio.run(_go())


def test_orm_check_tipo_rechaza_desconocido(tablas):
    from app.models import Notificacion

    async def _go():
        async with _nueva_sesion() as db:
            db.add(Notificacion(usuario_id=1, evento_id="x:1",
                                tipo="spam", titulo="t"))
            with pytest.raises(IntegrityError):
                await db.commit()
            await db.rollback()
    asyncio.run(_go())


def test_orm_unique_evento_id_permite_repetir_tipo(tablas):
    """Dedupe arbitrado: mismo tipo+aviso con evento_id distinto OK;
    mismo evento_id dos veces -> 409 lógico (IntegrityError)."""
    from app.models import Notificacion

    async def _go():
        async with _nueva_sesion() as db:
            db.add(Notificacion(usuario_id=1, publicacion_id=1,
                                evento_id="moderacion:1:2026-01-01",
                                tipo="moderacion", titulo="t1"))
            db.add(Notificacion(usuario_id=1, publicacion_id=1,
                                evento_id="moderacion:1:2026-02-01",
                                tipo="moderacion", titulo="t2"))
            await db.flush()
            db.add(Notificacion(usuario_id=1, publicacion_id=1,
                                evento_id="moderacion:1:2026-02-01",
                                tipo="moderacion", titulo="duplicado"))
            with pytest.raises(IntegrityError):
                await db.flush()
            await db.rollback()
    asyncio.run(_go())


def test_orm_busqueda_sin_busqueda_id_en_notif(tablas):
    """busqueda_id es opcional (alertas manuales/moderación sin búsqueda)."""
    from app.models import Notificacion

    async def _go():
        async with _nueva_sesion() as db:
            n = Notificacion(usuario_id=1, evento_id="moderacion:9:hoy",
                             tipo="moderacion", titulo="Revisado")
            db.add(n)
            await db.flush()
            assert n.busqueda_id is None
            await db.rollback()
    asyncio.run(_go())


def test_orm_fk_busqueda_set_null_al_borrar(tablas):
    from app.models import BusquedaGuardada, Notificacion

    async def _go():
        from sqlalchemy import select
        async with _nueva_sesion() as db:
            b = BusquedaGuardada(usuario_id=1)
            db.add(b)
            await db.flush()
            n = Notificacion(usuario_id=1, busqueda_id=b.id,
                             evento_id="nuevo_arriendo:2",
                             tipo="nuevo_arriendo", titulo="t")
            db.add(n)
            await db.flush()
            nid = n.id
            await db.delete(b)
            await db.flush()
            # Sin relationship() el ORM no refresca solo: se expira para leer
            # lo que la FK ON DELETE SET NULL dejó realmente en disco.
            db.expire_all()
            row = (await db.execute(
                select(Notificacion).where(Notificacion.id == nid))).scalars().first()
            assert row is not None and row.busqueda_id is None
            await db.rollback()
    asyncio.run(_go())
