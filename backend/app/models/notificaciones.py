"""Vinculación de Telegram, búsquedas guardadas y notificaciones in-app."""
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Numeric,
    UniqueConstraint,
    Index,
    func,
    text as sa_text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.models.base import Base


class TelegramVinculo(Base):
    """Bloque 2: nonces HMAC de vinculación persistentes (mig 015).

    La memoria (_TELEGRAM_VINCULOS) queda como L1/dev; PG es la fuente de
    verdad que sobrevive redeploys e instancias múltiples.

    Opción A (mig 018): `chat_id_pendiente` guarda QUÉ chat pidió el enlace
    con /start. La vinculación solo se completa al recibir el contacto
    compartido (request_contact) cuyo número coincida con el teléfono
    verificado del usuario. NULL = aún sin /start.
    """
    __tablename__ = "telegram_vinculos"
    __table_args__ = (
        Index("idx_telegram_vinculos_expira", "expira_en"),
        Index("idx_telegram_vinculos_chat", "chat_id_pendiente"),
    )
    nonce: Mapped[str] = mapped_column(String(32), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    chat_id_pendiente: Mapped[str | None] = mapped_column(String(32), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Notificaciones in-app + búsquedas guardadas (mig 019, Fase 1).
# Campanita: bandeja por usuario_id; matcher futuro filtra por precio,
# campus/tipo/zona y servicios (@>); dedupe por evento_id (reintentos
# seguros sin prohibir repeticiones futuras del mismo tipo).
class BusquedaGuardada(Base):
    __tablename__ = "busquedas_guardadas"
    __table_args__ = (
        CheckConstraint(
            "precio_min IS NULL OR precio_max IS NULL OR precio_min <= precio_max",
            name="chk_bg_rango",
        ),
        Index("idx_bg_matching", "activa", "campus_id", "tipo",
              postgresql_where=sa_text("activa")),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    nombre: Mapped[str | None] = mapped_column(Text, nullable=True)
    precio_min: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    precio_max: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    campus_id: Mapped[int | None] = mapped_column(
        ForeignKey("campus_universitarios.id", ondelete="SET NULL"), nullable=True)
    zona_barrio_id: Mapped[int | None] = mapped_column(
        ForeignKey("zonas_barrios.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    servicios_ids: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, default=list, server_default="{}")
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notificacion(Base):
    __tablename__ = "notificaciones"
    __table_args__ = (
        UniqueConstraint("usuario_id", "evento_id", name="uq_notif_usuario_evento"),
        CheckConstraint(
            "tipo IN ('nuevo_arriendo','moderacion','vencimiento','telegram')",
            name="chk_notif_tipo",
        ),
        # idx_notif_bandeja se declara bajo la clase (necesita created_at.desc()).
        Index("idx_notif_noleidas", "usuario_id",
              postgresql_where=sa_text("leida IS FALSE")),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    publicacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("publicaciones.id", ondelete="CASCADE"), nullable=True)
    busqueda_id: Mapped[int | None] = mapped_column(
        ForeignKey("busquedas_guardadas.id", ondelete="SET NULL"), nullable=True)
    evento_id: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    cuerpo: Mapped[str] = mapped_column(Text, nullable=False, default="")
    canal: Mapped[str] = mapped_column(String(20), nullable=False, default="app")
    leida: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    leida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# DESC explícito para la paginación de la bandeja (ORDER BY created_at DESC).
Index(
    "idx_notif_bandeja",
    Notificacion.usuario_id, Notificacion.created_at.desc(),
)
