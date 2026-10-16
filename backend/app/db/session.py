"""
db/session.py - Sesión async SQLAlchemy 2.0 + asyncpg -> PostgreSQL 16 (Sección 5.10)
No tocar si no eres de BD. Lee DATABASE_URL del .env
Sprint1: fallback mock si PG no disponible para que frontend no se bloquee.
"""
import os
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv()
_RAW_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau")

_ESQUEMAS_PG = ("postgresql", "postgresql+asyncpg")


def dsn_asyncpg_a_psycopg(dsn: str) -> str:
    """Convierte DSN asyncpg -> driver síncrono (scripts/tests con asyncpg
    directo o psycopg). Valida el esquema con allowlist y reconstruye por
    partes: nunca substring-replace ciego (CodeQL)."""
    partes = urlsplit(str(dsn or ""))
    if partes.scheme not in _ESQUEMAS_PG or not partes.hostname:
        raise ValueError("DSN postgres inválido")
    return urlunsplit(("postgresql",) + tuple(partes[1:]))


# Normaliza para Supabase pooler + asyncpg
# Supabase requiere ssl y pgbouncer handling para asyncpg
def _normalize_supabase_url(url: str) -> str:
    # Parseo estricto (CodeQL): decisiones por esquema/host exactos, nunca
    # por substring ("supabase.com" matcheaba p. ej. "notsupabase.com.evil").
    partes = urlsplit(str(url or ""))
    if partes.scheme not in _ESQUEMAS_PG or not partes.hostname:
        raise ValueError("DATABASE_URL inválida: esquema postgres requerido")
    esquema = "postgresql+asyncpg" if partes.scheme == "postgresql" else partes.scheme
    host = (partes.hostname or "").lower()
    params = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True)]
    nombres = {k.lower() for k, _ in params}
    # Solo host Supabase real (dominio exacto o subdominio .supabase.co/.com,
    # este último cubre el pooler *.pooler.supabase.com) y sin ssl ya dado.
    es_supabase = host in ("supabase.co", "supabase.com") or host.endswith(
        (".supabase.co", ".supabase.com"))
    if es_supabase and "ssl" not in nombres:
        params.append(("ssl", "require"))
    netloc = partes.netloc  # conserva usuario/clave/puerto tal cual
    return urlunsplit((esquema, netloc, partes.path, urlencode(params), partes.fragment))

DATABASE_URL = _normalize_supabase_url(_RAW_URL)

# PgBouncer / Supabase pooler (puerto 6543, transaction mode): las sentencias
# preparadas con nombre NO sobreviven al cambio de conexión del pool ->
# `asyncpg.exceptions.InvalidSQLStatementNameError: prepared statement does not exist`.
# Se desactiva SIEMPRE el caché (el flag `pgbouncer=true` en la URL no es fiable:
# Supabase no lo incluye). `statement_cache_size` lo consume asyncpg y
# `prepared_statement_cache_size` el dialecto SQLAlchemy-asyncpg. Costo: parseo
# por query (despreciable frente a un 500 en prod).
_connect_args = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
}

# pool 5-20 para 50-100 concurrentes Tabla18 (NFR)
# Sprint1: pool_pre_ping evita "cold start" + silent disconnect en Render
# B0 fix (<=3 líneas): bajo pytest usa NullPool (cada TestClient request corre en
# loop distinto; el pool persistente reutiliza conexiones atadas a loops cerrados
# -> RuntimeError "attached to a different loop"). Prod/dev intactos.
_engine_kwargs = (
    {"poolclass": NullPool}
    if "pytest" in sys.modules
    else {"pool_size": 5, "max_overflow": 15, "pool_pre_ping": True, "pool_recycle": 300}
)
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # True solo en dev
    connect_args=_connect_args,
    **_engine_kwargs,
)
AsyncSession = async_sessionmaker(engine, expire_on_commit=False)

async def get_session():
    async with AsyncSession() as s:
        yield s
