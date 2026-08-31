"""Config central - lee .env. SECRET_KEY para JWT HS256 8h (Tabla18 NFR + 5.6)."""
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau"
    SECRET_KEY: str = "cambia_esto_en_produccion_muy_largo_32_chars_min"
    ALGORITHM: str = "HS256"  # HS256 fijo para Sprint1 (Tabla18)
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8  # 8h expiración (p22)

    # Sprint1: permite funcionar sin PG (mock en memoria) si no hay DB
    USE_MOCK_FALLBACK: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
