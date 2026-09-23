"""Config central - lee .env. SECRET_KEY para JWT HS256 8h (Tabla18 NFR + 5.6)."""
import os
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator

# OLA2-M3: dominio prod canónico confirmado en dashboard Vercel (con guion).
# render.yaml y .env.example deben usar exactamente este valor.
CANONICAL_PROD_ORIGIN = "https://aloja-u.vercel.app"
TYPO_PROD_ORIGIN = "https://alojau.vercel.app"  # sin guion: typo histórico, rechazar en prod

# v13: versión vigente de la política de tratamiento de datos (Ley 1581/2012).
POLITICA_VERSION_VIGENTE = "v1.0-ley1581-2026"


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

    # Pesos de confianza (40+20+15+15+10) configurables por .env sin tocar código
    TRUST_WEIGHT_COMPLETITUD: int = 40
    TRUST_WEIGHT_TELEFONO: int = 20
    TRUST_WEIGHT_FOTOS: int = 15
    TRUST_WEIGHT_VIGENCIA: int = 15
    TRUST_WEIGHT_REPORTES: int = 10

    # F3 Cloudinary (persistencia prod). Si están vacíos -> storage local efímero (dev).
    # En Render/Supabase prod: setear CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_FOLDER: str = "alojau"

    # v13 Enterprise Auth (Supabase Auth / Google OAuth / JWKS).
    # Vacío = proveedor local HS256 (dev sin configuración externa).
    # En prod con Supabase: SUPABASE_URL + SUPABASE_JWKS_URL (o se deriva
    # como {SUPABASE_URL}/auth/v1/.well-known/jwks.json) + SUPABASE_AUD.
    SUPABASE_URL: str = ""
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_AUD: str = "authenticated"
    SUPABASE_ANON_KEY: str = ""

    # v13: frontend canónico para redirecciones OAuth (dev + prod).
    FRONTEND_URL: str = "http://localhost:5173"
    FRONTEND_PROD_URL: str = CANONICAL_PROD_ORIGIN

    # v13: OTP alternativo gratuito (Telegram Bot webhook opcional).
    # Vacío = solo Email-code (log en dev). Con token se intenta Telegram.
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # v13: versión de política de datos vigente (Ley 1581/2012).
    POLITICA_VERSION: str = POLITICA_VERSION_VIGENTE

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
            if TYPO_PROD_ORIGIN in self.cors_origins_list:
                raise ValueError(
                    f"Fail-closed: dominio con typo {TYPO_PROD_ORIGIN}; usa {CANONICAL_PROD_ORIGIN} (OLA2-M3)"
                )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cloudinary_configured(self) -> bool:
        """F3: True solo si las 3 credenciales están presentes (Strategy elige Cloudinary)."""
        return bool(
            self.CLOUDINARY_CLOUD_NAME.strip()
            and self.CLOUDINARY_API_KEY.strip()
            and self.CLOUDINARY_API_SECRET.strip()
        )

    @property
    def supabase_configured(self) -> bool:
        """v13: True si hay URL de Supabase (habilita JWKS/OAuth, nunca rompe local)."""
        return bool(self.SUPABASE_URL.strip())

    @property
    def jwks_url(self) -> str:
        """v13: URL JWKS efectiva (explícita o derivada del SUPABASE_URL)."""
        if self.SUPABASE_JWKS_URL.strip():
            return self.SUPABASE_JWKS_URL.strip()
        if self.SUPABASE_URL.strip():
            return self.SUPABASE_URL.strip().rstrip("/") + "/auth/v1/.well-known/jwks.json"
        return ""

    @property
    def oauth_redirect_urls(self) -> list[str]:
        """v13: redirect URLs válidas para Google OAuth (dev + prod)."""
        return [self.FRONTEND_URL.rstrip("/"), self.FRONTEND_PROD_URL.rstrip("/")]

    @property
    def mock_enabled(self) -> bool:
        # B0-2: mock solo si flag True Y ENV!=prod (doble check settings + entorno).
        return bool(self.USE_MOCK_FALLBACK) and self.ENV != "prod" and os.getenv("ENV", "dev") != "prod"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
