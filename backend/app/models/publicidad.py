"""Planes de publicidad y avisos destacados."""
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    Index,
    func,
    text as sa_text,
)
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.models.base import Base


# Publicidad: planes + destacados de publicaciones (mig 022).
# Un destacado = una compra de visibilidad por días con pago manual v1
# (pago_ref + aprobación admin). El historial nunca se borra: PENDIENTE
# vencido -> VENCIDO vía job vencer_destacados(); el unique parcial
# garantiza UN solo ACTIVO por publicación.
class PlanPublicidad(Base):
    __tablename__ = "planes_publicidad"
    __table_args__ = (
        CheckConstraint("dias > 0", name="chk_plan_dias"),
        CheckConstraint("precio_cop >= 0", name="chk_plan_precio"),
        CheckConstraint("prioridad > 0", name="chk_plan_prioridad"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    dias: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_cop: Mapped[int] = mapped_column(Integer, nullable=False)
    prioridad: Mapped[int] = mapped_column(Integer, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PublicacionDestacado(Base):
    __tablename__ = "publicacion_destacados"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('PENDIENTE','ACTIVO','VENCIDO','RECHAZADO')",
            name="chk_destacado_estado",
        ),
        CheckConstraint("vence > inicia", name="chk_destacado_vigencia"),
        Index("idx_destacados_pub_estado", "publicacion_id", "estado"),
        Index("idx_destacados_estado_vence", "estado", "vence"),
        # Un solo ACTIVO por publicación (parcial; el historial múltiple
        # PENDIENTE/VENCIDO/RECHAZADO sí está permitido).
        Index("uq_destacado_pub_activo", "publicacion_id",
              unique=True, postgresql_where=sa_text("estado = 'ACTIVO'")),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publicacion_id: Mapped[int] = mapped_column(
        ForeignKey("publicaciones.id", ondelete="CASCADE"), nullable=False)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("planes_publicidad.id", ondelete="RESTRICT"), nullable=False)
    inicia: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())
    vence: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    estado: Mapped[str] = mapped_column(Text, default="PENDIENTE", nullable=False)
    pago_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())
