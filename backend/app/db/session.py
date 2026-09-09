"""
db/session.py - Sesión async SQLAlchemy 2.0 + asyncpg -> PostgreSQL 16 (Sección 5.10)
No tocar si no eres de BD. Lee DATABASE_URL del .env
Sprint1: fallback mock si PG no disponible para que frontend no se bloquee.
"""
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv()
_RAW_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau")

# Normaliza para Supabase pooler + asyncpg
# Supabase requiere ssl y pgbouncer handling para asyncpg
def _normalize_supabase_url(url: str) -> str:
    # Asegura prefijo asyncpg
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Si es Supabase y no tiene ssl, añadir ssl=require
    if "supabase.com" in url and "ssl" not in url.lower():
        url += ("&" if "?" in url else "?") + "ssl=require"
    return url

DATABASE_URL = _normalize_supabase_url(_RAW_URL)

# Detecta pgbouncer para desactivar statement cache (asyncpg + pgbouncer)
_is_pgbouncer = "pgbouncer=true" in DATABASE_URL.lower()
_connect_args = {"statement_cache_size": 0} if _is_pgbouncer else {}

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
