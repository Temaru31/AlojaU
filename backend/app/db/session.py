"""
Sesión async SQLAlchemy 2.0 + asyncpg -> PostgreSQL 16
No tocar si no eres de BD. Lee DATABASE_URL del .env
Ver Seccion 5.6 Tabla16 y 5.8 diccionario
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau")

# pool 5-20 para 50-100 concurrentes Tabla16:27
engine = create_async_engine(DATABASE_URL, echo=True, pool_size=5, max_overflow=15)
AsyncSession = async_sessionmaker(engine, expire_on_commit=False)

async def get_session():
    async with AsyncSession() as s:
        yield s
