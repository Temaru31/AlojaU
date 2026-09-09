"""Config central - lee .env. SECRET_KEY para JWT HS256 8h (Tabla18 NFR + 5.6)."""
import os
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator

class Settings(BaseSettings):
    ENV: str = "dev"  # dev|test|prod - prod activa fail-closed RLS/SEC
    DATABASE_URL: str = "postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau"
    SECRET_KEY: str = "cambia_esto_en_produccion_muy_largo_32_chars_min"
    ALGORITHM: str = "HS256"  # HS256 fijo para Sprint1 (Tabla18)
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8  # 8h expiración (p22)

    # Sprint1: permite funcionar sin PG (mock en memoria) si no hay DB
    USE_MOCK_FALLBACK: bool = True

    # CORS restringido por env (DoD-5) - prod solo Vercel
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @field_validator("ENV")
    @classmethod
    def check_env(cls, v: str) -> str:
        if v not in ("dev", "test", "prod"):
            raise ValueError("ENV debe ser dev|test|prod")
        return v

    @field_validator("SECRET_KEY")
    @classmethod
    def check_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY debe tener al menos 32 caracteres")
        if v == "cambia_esto_en_produccion_muy_largo_32_chars_min" and os.getenv("ENV", "dev") == "prod":
            raise ValueError("Cambia SECRET_KEY en producción (DoD-5)")
        return v

    @model_validator(mode="after")
    def fail_closed_prod(self):
        """Fail-closed RLS/SEC: no arrancar en prod con SECRET default/corto o mock True."""
        is_prod = self.ENV == "prod" or os.getenv("ENV", "dev") == "prod"
        if is_prod:
            if self.SECRET_KEY == "cambia_esto_en_produccion_muy_largo_32_chars_min" or len(self.SECRET_KEY) < 32:
                raise ValueError("Fail-closed: SECRET_KEY default o corto en prod (DoD-5)")
            if self.USE_MOCK_FALLBACK:
                raise ValueError("Fail-closed: USE_MOCK_FALLBACK debe ser False en prod (DoD-5)")
            if "*" in self.CORS_ORIGINS:
                raise ValueError("Fail-closed: CORS_ORIGINS no puede contener * en prod")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def mock_enabled(self) -> bool:
        # B0-2: mock solo si flag True Y ENV!=prod (doble check settings + entorno).
        return bool(self.USE_MOCK_FALLBACK) and self.ENV != "prod" and os.getenv("ENV", "dev") != "prod"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
