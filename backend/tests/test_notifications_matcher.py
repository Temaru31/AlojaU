"""Fase 2: matching engine set-based (precio/campus/zona/tipo/servicios).

- Matriz de filtros con comodines NULL/vacío.
- Dedupe por evento_id ante doble ejecución.
- Savepoint: un matcher roto no tumba la transacción principal.
- Purga TTL 90d acotada dentro del bloque.
Requiere PG real (operadores de arrays); si no, skip.
"""
import asyncio
import os
from datetime import datetime, timezone, timedelta

import pytest

from app.services import notifications_matcher as nm


def _dsn():
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    from app.db.session import dsn_asyncpg_a_psycopg
    return dsn_asyncpg_a_psycopg(raw)


def _pg():
    return "supabase.co" not in _dsn().lower()


async def _sql(sql, *args):
    import asyncpg
    conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
    try:
        return await conn.execute(sql, *args)
    finally:
        await conn.close()


@pytest.fixture()
def limpias():
    # La BD de dev no tiene las tablas hasta correr la mig 019: se aplica el
    # espejo SQL (idempotente) aquí mismo, igual que en Fase 1.
    if not _pg():
        pytest.skip("sin PG real")
    import pathlib
    mirror = pathlib.Path(__file__).resolve().parent.parent / "db" / "migrations" \
        / "019_notificaciones_y_busquedas.sql"
    texto = mirror.read_text(encoding="utf-8").split("-- DOWNGRADE")[0]
    stmts = []
    for chunk in texto.split(";"):
        stmt = "\n".join(ln for ln in chunk.splitlines()
                         if ln.strip() and not ln.strip().startswith("--")).strip()
        if stmt:
            stmts.append(stmt)

    async def _aplicar():
        import asyncpg
        conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
        try:
            for s in stmts:
                await conn.execute(s)
        finally:
            await conn.close()
    async def _truncate_seguro():
        import asyncpg
        conn = await asyncio.wait_for(asyncpg.connect(_dsn()), timeout=10)
        try:
            hay = await conn.fetchval(
                "SELECT count(*) FROM pg_tables WHERE tablename IN "
                "('notificaciones','busquedas_guardadas')")
            if hay == 2:
                await conn.execute("TRUNCATE notificaciones, busquedas_guardadas")
        finally:
            await conn.close()
    asyncio.run(_aplicar())
    asyncio.run(_truncate_seguro())
    yield
    asyncio.run(_truncate_seguro())


def _nueva_sesion():
    from app.db.session import AsyncSession
    return AsyncSession()


async def _alerta(uid, **kw):
    from app.models import BusquedaGuardada
    vals = {"usuario_id": uid}
    vals.update(kw)
    async with _nueva_sesion() as db:
        b = BusquedaGuardada(**vals)
        db.add(b)
        await db.commit()
        return b.id


def _contar_notif():
    async def _go():
        import asyncpg
        conn = await asyncpg.connect(_dsn())
        try:
            return await conn.fetchval("SELECT count(*) FROM notificaciones")
        finally:
            await conn.close()
    return asyncio.run(_go())


PUB = dict(publicacion_id=1, dueno_id=1, titulo="Aviso de prueba",
           canon=500000, campus_ids=[1], zona_id=3, tipo="APARTAESTUDIO",
           servicios_ids=[1, 2])


async def _match(db, **cambios):
    args = dict(PUB)
    args.update(cambios)
    return await nm.evaluar_y_crear_notificaciones(db, **args)


def test_match_basico_y_comodines(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            # Rango que contiene, campus/tipo/zona NULL (comodines).
            await _alerta(2, precio_min=400000, precio_max=600000)
            n = await _match(db)
            assert n == 1
            await db.commit()  # el commit lo hace el endpoint; sin él la
            # otra conexión no ve las filas (falso negativo en el conteo).
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_precio_fuera_no_matchea(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2, precio_min=600001)
            await _alerta(3, precio_max=499999)
            assert await _match(db) == 0
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 0


def test_campus_y_tipo(limpias):
    # Las 2 alertas del user 2 que casan generan UNA fila (dedupe evento_id).
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2, campus_id=1)          # coincide
            await _alerta(3, campus_id=2)          # distinto
            await _alerta(2, tipo="APARTAESTUDIO")  # coincide (dedupe)
            n = await _match(db)
            assert n == 1
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_pub_sin_campus_no_filtra(limpias):
    # in_([]) sería siempre-falso: sin campus vinculados, todo pasa el filtro.
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2, campus_id=1)
            assert await _match(db, campus_ids=[]) == 1
    asyncio.run(_go())


def test_zona_exacta_o_nula(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2, zona_barrio_id=3)  # exacta
            await _alerta(3, zona_barrio_id=5)  # otra zona
            assert await _match(db) == 1
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_pub_sin_zona_solo_comodines(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2)                    # zona NULL: pasa
            await _alerta(3, zona_barrio_id=5)  # exige zona: no pasa
            assert await _match(db, zona_id=None) == 1
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_servicios_contencion(limpias):
    # Una fila por (usuario, aviso): las 2 alertas del user 2 que casan
    # generan UNA notificación (anti-spam; busqueda_id ilustrativa).
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2, servicios_ids=[1])       # subconjunto: sí
            await _alerta(3, servicios_ids=[1, 9])    # exige de más: no
            await _alerta(2, servicios_ids=[])        # vacío: comodín (dedupe)
            assert await _match(db) == 1
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_autoexclusion_e_inactivas(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(1)  # dueño: jamás se auto-notifica
            await _alerta(2, activa=False)
            assert await _match(db) == 0
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 0


def test_dedupe_doble_ejecucion(limpias):
    async def _go():
        async with _nueva_sesion() as db:
            await _alerta(2)
            assert await _match(db) == 1
            await db.commit()
            assert await _match(db) == 0  # ON CONFLICT: nada nuevo
            await db.commit()
    asyncio.run(_go())
    assert _contar_notif() == 1


def test_savepoint_fallo_no_tumba_transaccion(limpias):
    """Canon basura rompe el matcher DENTRO del savepoint: retorna 0 y la
    transacción principal sigue commiteando (prueba del arbitraje)."""
    async def _go():
        from app.models import BusquedaGuardada
        async with _nueva_sesion() as db:
            b = BusquedaGuardada(usuario_id=2)
            db.add(b)
            n = await nm.evaluar_y_crear_notificaciones(
                db, publicacion_id=1, dueno_id=1, titulo="t",
                canon="basura-no-numerica", campus_ids=[], zona_id=None,
                tipo=None, servicios_ids=[])
            assert n == 0
            await db.commit()  # si el savepoint no aislara, esto explotaría
            return b.id
    bid = asyncio.run(_go())
    assert isinstance(bid, int)


def test_purga_ttl_acotada(limpias):
    async def _go():
        from app.models import Notificacion
        from sqlalchemy import select
        async with _nueva_sesion() as db:
            vieja = Notificacion(
                usuario_id=2, evento_id="vieja:1", tipo="nuevo_arriendo",
                titulo="vieja", leida=True,
                created_at=datetime.now(timezone.utc) - timedelta(days=100))
            db.add(vieja)
            await db.commit()
            await _alerta(2)
            await _match(db)  # la purga corre en el mismo bloque
            queda = (await db.execute(
                select(Notificacion).where(Notificacion.evento_id == "vieja:1"))
            ).scalars().first()
            assert queda is None
            vivas = (await db.execute(
                select(Notificacion).where(Notificacion.evento_id == "nuevo_arriendo:1"))
            ).scalars().all()
            assert len(vivas) == 1
    asyncio.run(_go())
