"""
db/session.py - Sesión async SQLAlchemy 2.0 + asyncpg -> PostgreSQL 16 (Sección 5.10)
No tocar si no eres de BD. Lee DATABASE_URL del .env
Sprint1: fallback mock si PG no disponible para que frontend no se bloquee.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau")

# pool 5-20 para 50-100 concurrentes Tabla18 (NFR)
# Sprint1: pool_pre_ping evita "cold start" + silent disconnect en Render
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # True solo en dev
    pool_size=5,
    max_overflow=15,
    pool_pre_ping=True,
    pool_recycle=300,
)
AsyncSession = async_sessionmaker(engine, expire_on_commit=False)

async def get_session():
    async with AsyncSession() as s:
        yield s

# Helper para routers: intenta DB, si falla retorna None (mock)
async def try_get_session():
    try:
        async with AsyncSession() as s:
            # ping rápido
            await s.execute(__import__("sqlalchemy").text("SELECT 1"))
            yield s
    except Exception:
        yield None
