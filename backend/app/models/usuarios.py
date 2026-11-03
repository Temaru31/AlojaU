"""Usuarios y seguridad de cuenta: sesiones, OTP, recuperación y rate-limit persistente."""
from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.models.base import Base
from app.models.preferencias import Preferencias


# ---------------------------------------------------------------------------
# Usuarios (v13: ESTUDIANTE base + ARRENDADOR + ADMIN + futuros roles)
# ---------------------------------------------------------------------------
class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        CheckConstraint(
            "rol IN ('ESTUDIANTE','ARRENDADOR','ADMIN','MODERADOR_CAMPUS','AUDITOR_LEGAL')",
            name="chk_rol",
        ),
        CheckConstraint("telefono_whatsapp ~ '^\\+?[0-9]{7,20}$'", name="chk_telefono_formato"),
        Index("idx_usuarios_rol", "rol"),
        Index("idx_usuarios_eliminado", "eliminado_en"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nombre_completo: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Marketplace: teléfono opcional (NULL = sin vincular; el CHECK solo
    # valida no-nulos). Se exige al publicar, no al registrarse.
    telefono_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rol: Mapped[str] = mapped_column(String(20), nullable=False, default="ESTUDIANTE")  # v13 base
    telefono_verificado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Enterprise Auth / Ley 1581:
    auth_provider: Mapped[str] = mapped_column(String(30), default="password", nullable=False)
    supabase_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    email_verificado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acepto_tratamiento_datos: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_consentimiento: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_consentimiento: Mapped[str | None] = mapped_column(String(45), nullable=True)
    version_politica: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Soft-delete: NULL = activa; fecha = en período de gracia (30 días)
    # antes del borrado físico (purga). Permite recuperar la cuenta.
    eliminado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Marketplace flexible: bio, foto y preferencias extensibles.
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    foto_perfil_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preferencias: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict,
                                               server_default="{}")
    # Telegram $0: chat_id para DM de OTP (NULL = sin vincular).
    # Nunca se postea a canales/grupos; solo DM si existe.
    telegram_chat_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    @property
    def preferencias_obj(self) -> "Preferencias":
        """Instancia de Preferencias construida desde el JSONB."""
        raw = self.preferencias or {}
        if not isinstance(raw, dict):
            return Preferencias()
        return Preferencias.from_dict(raw)

    @preferencias_obj.setter
    def preferencias_obj(self, valor: "Preferencias | dict | None") -> None:
        if valor is None:
            self.preferencias = {}
        elif isinstance(valor, Preferencias):
            self.preferencias = valor.to_dict()
        elif isinstance(valor, dict):
            self.preferencias = Preferencias.from_dict(valor).to_dict()
        else:
            raise TypeError("preferencias_obj debe ser Preferencias, dict o None")


# ---------------------------------------------------------------------------
# Enterprise Auth: rate-limit persistente, OTP, recovery y sesiones.
# Tablas pequeñas, TTL por expiración, índices por (clave, creado).
# ---------------------------------------------------------------------------
class RateLimitAttempt(Base):
    """Intentos de login/recovery persistentes (sobreviven reinicios Render)."""
    __tablename__ = "rate_limit_attempts"
    __table_args__ = (
        Index("idx_ratelimit_clave_creado", "clave", "creado_en"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    clave: Mapped[str] = mapped_column(String(180), nullable=False)  # "login:ip:x" | "login:user:x"
    exito: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OtpCode(Base):
    """Códigos de 6 dígitos con expiración 10min (Email o Telegram)."""
    __tablename__ = "otp_codes"
    __table_args__ = (
        Index("idx_otp_email_creado", "email", "creado_en"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(180), nullable=False)
    codigo_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    proposito: Mapped[str] = mapped_column(String(30), nullable=False, default="email_verify")
    consumido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordReset(Base):
    """Enlaces firmados de un solo uso, expiración corta (15min)."""
    __tablename__ = "password_resets"
    __table_args__ = (
        Index("idx_pwreset_email_creado", "email", "creado_en"),
        UniqueConstraint("token_hash", name="uq_pwreset_token"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(180), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    consumido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Sesion(Base):
    """Sesiones activas (jti de refresh/access) para revocación global."""
    __tablename__ = "sesiones"
    __table_args__ = (
        Index("idx_sesiones_usuario", "usuario_id"),
        UniqueConstraint("jti", name="uq_sesiones_jti"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    jti: Mapped[str] = mapped_column(String(64), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revocado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revocado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
