"""Ajustes del sistema editables desde el panel admin."""
from sqlalchemy import BigInteger, DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.models.base import Base


# ---------------------------------------------------------------------------
# Ajustes automatizados por UI (tabla system_settings, borrador).
# La máquina de estados extendida (PAUSADO_POR_REPORTE, REVISION_REQUERIDA)
# llega vía migración 005; el CHECK del modelo se amplía sin romper los
# 7 estados previos (aditivo). Ver docs/ADMIN_AUTOMATION_SPECS.md.
# ---------------------------------------------------------------------------
class SystemSetting(Base):
    __tablename__ = "system_settings"
    __table_args__ = (
        UniqueConstraint("clave", name="uq_system_settings_clave"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    clave: Mapped[str] = mapped_column(String(80), nullable=False)
    valor: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="int")
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
