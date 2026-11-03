"""Contratos Pydantic de /api/auth (entrada y salida)."""
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from app.core.config import settings


# Esquemas
class RegisterIn(BaseModel):
    # Ingesta estricta: campos extra (rol, verificados...) se rechazan 422
    # en vez de ignorarse en silencio (anti mass-assignment por sondeo).
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    nombre_completo: str = Field(min_length=3, max_length=150)
    # Progressive profiling: teléfono opcional al registrarse
    # (se exige al publicar). None/'' = sin vincular.
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    # Ley 1581/2012: consentimiento explícito obligatorio.
    acepto_tratamiento_datos: bool = Field(default=False)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PerfilOut(BaseModel):
    id: int
    email: EmailStr
    nombre_completo: str
    telefono_whatsapp: Optional[str] = None
    telefono_verificado: bool = False
    rol: str
    email_verificado: bool = False
    auth_provider: str = "password"
    # Marketplace flexible:
    bio: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    preferencias: dict = Field(default_factory=dict)
    # Aditivo: true si hay telegram_chat_id vinculado (para DM OTP $0).
    telegram_vinculado: bool = False


class PerfilUpdateIn(BaseModel):
    # SIN extra="forbid" a propósito. El contrato probado exige que
    # `telefono_verificado` enviado se IGNORE con 200 (test_patch_perfil_...,
    # RT11): un 422 rompería clientes que reenvían el perfil completo.
    # Los sensibles siguen sin efecto (el sanitizador solo lee claves lícitas).

    # Telefono_verificado es SOLO-LECTURA (lo calcula/muestra el backend).
    nombre_completo: Optional[str] = Field(default=None, min_length=3, max_length=150)
    # None/'' limpia el teléfono (NULL). Con dígitos se normaliza E.164.
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    bio: Optional[str] = Field(default=None, max_length=500)
    foto_perfil_url: Optional[str] = Field(default=None, max_length=500)
    # Merge-parcial (solo las claves enviadas se actualizan).
    preferencias: Optional[dict] = None


class RegisterOut(BaseModel):
    id: int
    email: EmailStr
    rol: str
    mock: bool = False
    email_verificado: bool = False


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Fuente única settings (integración ramaDavid): create_token usa el mismo
    # valor, así el contrato siempre refleja la expiración real (2h).
    expires_in_hours: int = settings.ACCESS_TOKEN_EXPIRE_HOURS
    rol: str
    mock: bool = False
    # Callbacks Google: True si esta petición creó la cuenta (mostrar
    # "¡Cuenta creada!" en vez de "Bienvenido de nuevo"). Solo informativo.
    es_nuevo: bool = False


class PasswordChangeIn(BaseModel):
    actual: str = Field(min_length=1, max_length=72)
    nueva: str = Field(min_length=8, max_length=72)


class OtpSolicitarIn(BaseModel):
    email: EmailStr
    proposito: str = Field(default="email_verify", pattern="^(email_verify|login|recovery)$")


class OtpVerificarIn(BaseModel):
    email: EmailStr
    codigo: str = Field(min_length=6, max_length=6, pattern="^[0-9]{6}$")
    proposito: str = Field(default="email_verify", pattern="^(email_verify|login|recovery)$")


class RecoverySolicitarIn(BaseModel):
    email: EmailStr


class RecoveryConfirmarIn(BaseModel):
    email: EmailStr
    token: str = Field(min_length=20, max_length=128)
    nueva_password: str = Field(min_length=8, max_length=72)


class GoogleCallbackIn(BaseModel):
    """Callback de Supabase OAuth: el frontend envía el perfil verificado.

    Flujo real: el usuario vuelve de Google a {frontend}/auth/callback con
    el JWT de Supabase; el frontend lo valida y envía aquí email + supabase_id
    + nombre para linking/creación. Si SUPABASE está configurado, el backend
    puede validar el supabase_jwt contra JWKS (fail-closed 401 si no pasa).
    """
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    nombre_completo: str = Field(min_length=1, max_length=150)
    supabase_id: Optional[str] = Field(default=None, max_length=64)
    supabase_jwt: Optional[str] = None
    # Google no entrega teléfono; None = sin vincular (no placeholder).
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    # Avatar de Google (picture). Se valida https:// en el endpoint.
    foto_perfil_url: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _nombre_nunca_vacio(self):
        """v13.1: fallback seguro si Google devuelve nombre <2 caracteres
        (ej. 'a@domain.com'). Nunca 422: sanitiza en vez de rechazar."""
        nombre = (self.nombre_completo or "").strip()
        if len(nombre) < 2:
            local = str(self.email).split("@")[0].strip() or "google"
            nombre = f"Usuario {local}"[:150].strip()
        self.nombre_completo = nombre
        return self


class SesionOut(BaseModel):
    jti: str
    ip: Optional[str] = None
    creado_en: Optional[str] = None
    actual: bool = False
    # UX: user-agent crudo del dispositivo (el frontend lo parsea a
    # etiqueta amigable tipo "Chrome en Windows"). Aditivo: puede venir None.
    user_agent: Optional[str] = None


class CuentaEliminarIn(BaseModel):
    """Doble confirmación: email escrito a mano + contraseña (si tiene)."""
    confirm_email: EmailStr
    password: Optional[str] = Field(default=None, max_length=72)


class CuentaRestaurarIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)
