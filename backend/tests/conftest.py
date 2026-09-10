"""T5 aislamiento - pytest NUNCA deja basura en PostgreSQL.

Estrategia: cada test arranca con la BD restaurada al seed canónico
(TRUNCATE + seed.sql, ~150ms) y al cerrar la sesión se restaura una vez más.
Garantía verificable: counts(publicaciones, reportes, usuarios) idénticos
antes y después de la suite.

Por qué NO transacciones con ROLLBACK por test: los endpoints corren en el
portal anyio del TestClient (loop e hilos distintos al del test) y cada
request abre su propia conexión (NullPool bajo pytest, ver
app/db/session.py). Un SAVEPOINT compartido no puede cruzar esos loops, y
convertir commit()->flush() rompería los tests multi-request (POST y luego
GET no vería lo creado). SQLite tampoco sirve: SQL específico de PG.
El reseed es simple, determinista y rápido.

SEGURIDAD: si DATABASE_URL apunta a prod (supabase.co o ENV=prod) la sesión
se ABORTA con error explícito. JAMÁS truncar producción por accidente.
Sin PG (modo mock), se omite con aviso y la suite corre como hoy.
"""
import asyncio
import os

import pytest

_SEED_SQL = os.path.join(os.path.dirname(__file__), "..", "db", "seed.sql")
_aviso_mostrado = {"mock": False}


def _dsn_test() -> str:
    raw = os.getenv(
        "DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau"
    )
    dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
    return dsn


def _es_url_segura(dsn: str) -> bool:
    bajo = dsn.lower()
    if "supabase.co" in bajo:
        return False
    if os.getenv("ENV", "dev").lower() == "prod":
        return False
    return True


def _reseed_sync() -> None:
    """TRUNCATE + seed.sql en su propio loop (conexión independiente, sin
    interferir con el portal del TestClient). Lanza si PG no responde."""

    async def _run():
        import asyncpg

        dsn = _dsn_test()
        ssl = "supabase.co" in dsn and "ssl=" not in dsn
        conn = await asyncpg.connect(dsn, ssl=ssl if ssl else None)
        try:
            with open(_SEED_SQL, encoding="utf-8") as f:
                await conn.execute(f.read())
        finally:
            await conn.close()

    asyncio.run(_run())


def _pg_disponible() -> bool:
    dsn = _dsn_test()
    if not _es_url_segura(dsn):
        # Fail-closed: abortar la sesión entera antes de tocar nada.
        pytest.exit(
            "T5-SEGURIDAD: DATABASE_URL apunta a producción. "
            "pytest NUNCA se ejecuta contra prod. Revisa tu .env.",
            returncode=2,
        )
    try:
        _reseed_sync()
        return True
    except Exception as e:
        if not _aviso_mostrado["mock"]:
            print(f"\n[T5] PG no disponible ({type(e).__name__}): suite en modo mock, sin reseed.")
            _aviso_mostrado["mock"] = True
        return False


@pytest.fixture(scope="session", autouse=True)
def _t5_sesion_limpia():
    """Al cerrar la suite, restaura el seed (la BD queda como se encontró)."""
    yield
    try:
        if _es_url_segura(_dsn_test()):
            _reseed_sync()
            print("\n[T5] sesión cerrada: BD restaurada al seed.")
    except Exception as e:
        print(f"\n[T5] aviso: no se pudo restaurar al cierre ({type(e).__name__}).")


@pytest.fixture(scope="function", autouse=True)
def _t5_test_hermetico():
    """Cada test parte del seed canónico (hermético, sin depender del orden)."""
    _pg_disponible()
    yield
    # Sin teardown por test: el setup del siguiente + el cierre de sesión restauran.
