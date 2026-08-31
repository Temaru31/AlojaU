"""Config - lee .env. SECRET_KEY para JWT HS256 8h Tabla16:27"""
from pydantic_settings import BaseSettings
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau"
    SECRET_KEY: str = "cambia_esto_en_produccion_muy_largo_32_chars_min"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8
    class Config:
        env_file = ".env"
settings = Settings()
