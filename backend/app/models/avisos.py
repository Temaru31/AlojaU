"""Avisos (publicaciones) y sus relaciones: servicios, campus, fotos, reportes y auditoría."""
from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, SmallInteger, String, Text, Numeric, UniqueConstraint, Index, func, text as sa_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.models.base import Base


# ---------------------------------------------------------------------------
# Publicaciones (FIX: + latitud, longitud, indice_confianza + relationships)
# ---------------------------------------------------------------------------
class Publicacion(Base):
    __tablename__ = "publicaciones"
    __table_args__ = (
        # Chk_tipo reemplazada por FK RESTRICT a housing_types (mig 013).
        # Se evita borrar slugs en uso (ON DELETE RESTRICT).
        # Fase 5 (aditivo): + PAUSADO_POR_REPORTE + REVISION_REQUERIDA. Los 7 previos siguen válidos.
        CheckConstraint("estado IN ('PENDIENTE','ACTIVO','PAUSADO','ARRENDADO','EXPIRADO','RECHAZADO','DESACTIVADO','PAUSADO_POR_REPORTE','REVISION_REQUERIDA')", name="chk_estado"),
        CheckConstraint("canon_mensual > 0", name="chk_canon"),
        CheckConstraint("deposito_requerido >= 0", name="chk_deposito"),
        CheckConstraint("indice_confianza BETWEEN 0 AND 100", name="chk_confianza"),
        CheckConstraint("latitud BETWEEN -90 AND 90", name="chk_pub_lat"),
        CheckConstraint("longitud BETWEEN -180 AND 180", name="chk_pub_lon"),
        CheckConstraint("char_length(titulo) >= 10", name="chk_titulo_len"),
        CheckConstraint("char_length(descripcion) >= 20", name="chk_desc_len"),
        CheckConstraint("fecha_expiracion > fecha_publicacion", name="chk_expiracion"),
        Index("idx_publicaciones_estado_canon", "estado", "canon_mensual"),
        Index("idx_publicaciones_zona_estado", "zona_barrio_id", "estado"),
        Index("idx_publicaciones_usuario", "usuario_id"),
        Index("idx_publicaciones_vigencia", "fecha_renovacion"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    # Zona opcional: el barrio personalizado vive en barrio_texto.
    zona_barrio_id: Mapped[int | None] = mapped_column(ForeignKey("zonas_barrios.id", ondelete="RESTRICT"), nullable=True)
    barrio_texto: Mapped[str | None] = mapped_column(String(120), nullable=True)
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    # FK RESTRICT a housing_types.slug (mig 013). El CHECK estático se eliminó.
    tipo_inmueble: Mapped[str] = mapped_column(
        String(40), ForeignKey("housing_types.slug", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False)
    canon_mensual: Mapped[float] = mapped_column(Numeric(10,2), nullable=False)
    deposito_requerido: Mapped[float] = mapped_column(Numeric(10,2), default=0, nullable=False)
    incluye_servicios_base: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reglas_convivencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    direccion_referencial: Mapped[str] = mapped_column(String(200), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="PENDIENTE", nullable=False)
    # FIX CRÍTICO
    latitud: Mapped[float | None] = mapped_column(Numeric(10,7), nullable=True)
    longitud: Mapped[float | None] = mapped_column(Numeric(10,7), nullable=True)
    indice_confianza: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    # Métrica de vistas (incremental, dedup diaria por IP en endpoint).
    vistas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fecha_publicacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fecha_renovacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fecha_expiracion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sa_text("NOW() + INTERVAL '30 days'"))

    # Relationships para evitar N+1 y permitir selectinload (router espera .servicios y .imagenes)
    zona: Mapped["ZonaBarrio | None"] = relationship(lazy="joined")
    usuario: Mapped["Usuario"] = relationship(lazy="joined")
    servicios: Mapped[list["ServicioCatalogo"]] = relationship(secondary="publicacion_servicios", lazy="selectin")
    # BUG#1 portada: orden determinista en TODOS los eager-loads (fetch_page,
    # detail, mias, pendientes, cambiar-estado, similares, editar). Sin esto
    # fotos[0] era orden de heap, no la portada (orden=1). Fuente única de
    # verdad a nivel ORM; la capa vista además ordena defensivamente por orden.
    imagenes: Mapped[list["ImagenPublicacion"]] = relationship(back_populates="publicacion", cascade="all, delete-orphan", lazy="selectin", order_by="ImagenPublicacion.orden")
    campus_links: Mapped[list["PublicacionCampus"]] = relationship(back_populates="publicacion", cascade="all, delete-orphan", lazy="selectin")

# ---------------------------------------------------------------------------
# N:M publicacion_servicios
# ---------------------------------------------------------------------------
class PublicacionServicio(Base):
    __tablename__ = "publicacion_servicios"
    publicacion_id: Mapped[int] = mapped_column(ForeignKey("publicaciones.id", ondelete="CASCADE"), primary_key=True)
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios_catalogo.id", ondelete="CASCADE"), primary_key=True)

# ---------------------------------------------------------------------------
# N:M publicacion_campus (distancia precalculada Haversine)
# ---------------------------------------------------------------------------
class PublicacionCampus(Base):
    __tablename__ = "publicacion_campus"
    __table_args__ = (
        CheckConstraint("distancia_geodesica_m >= 0", name="chk_distancia"),
        Index("idx_pubcampus_campus_dist", "campus_id", "distancia_geodesica_m"),
        Index("idx_pubcampus_pub", "publicacion_id"),
    )
    publicacion_id: Mapped[int] = mapped_column(ForeignKey("publicaciones.id", ondelete="CASCADE"), primary_key=True)
    campus_id: Mapped[int] = mapped_column(ForeignKey("campus_universitarios.id", ondelete="CASCADE"), primary_key=True)
    # NULL cuando la pub no tiene coords (no 0).
    distancia_geodesica_m: Mapped[int | None] = mapped_column(Integer, nullable=True)

    publicacion: Mapped["Publicacion"] = relationship(back_populates="campus_links")

# ---------------------------------------------------------------------------
# Imagenes
# ---------------------------------------------------------------------------
class ImagenPublicacion(Base):
    __tablename__ = "imagenes_publicacion"
    __table_args__ = (
        UniqueConstraint("publicacion_id", "orden", name="uq_imagen_pub_orden"),
        CheckConstraint("orden > 0", name="chk_orden"),
        Index("idx_imagenes_pub", "publicacion_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publicacion_id: Mapped[int] = mapped_column(ForeignKey("publicaciones.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    publicacion: Mapped["Publicacion"] = relationship(back_populates="imagenes")

# ---------------------------------------------------------------------------
# Reportes (FIX estado solo PENDIENTE/DESCARTADO/CONFIRMADO)
# ---------------------------------------------------------------------------
class ReportePublicacion(Base):
    __tablename__ = "reportes_publicacion"
    __table_args__ = (
        CheckConstraint("motivo IN ('POSIBLE_ESTAFA','DATOS_FALSOS','INMUEBLE_ARRENDADO','FOTOS_ENGANOSAS','OTRO')", name="chk_motivo"),
        CheckConstraint("estado IN ('PENDIENTE','DESCARTADO','CONFIRMADO')", name="chk_reporte_estado"),
        Index("idx_reportes_pub_estado", "publicacion_id", "estado"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publicacion_id: Mapped[int] = mapped_column(ForeignKey("publicaciones.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    motivo: Mapped[str] = mapped_column(String(40), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="PENDIENTE", nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# ---------------------------------------------------------------------------
# Audit (FIX tabla faltante) - alineado a schema.sql
# ---------------------------------------------------------------------------
class PublicacionesAudit(Base):
    __tablename__ = "publicaciones_audit"
    __table_args__ = (
        # Historial: + SETTINGS (ajustes) y CUENTA_DELETE (soft-delete).
        CheckConstraint("evento IN ('CREATED','APPROVED','REJECTED','PAUSED','RESUMED','RENTED','EXPIRED','RENEWED','BLOCKED','SETTINGS','CUENTA_DELETE')", name="chk_evento"),
        Index("idx_audit_pub", "publicacion_id"),
        Index("idx_audit_evento", "evento"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # NULL cuando el acto no refiere a un aviso (SETTINGS, CUENTA_DELETE).
    publicacion_id: Mapped[int | None] = mapped_column(ForeignKey("publicaciones.id", ondelete="CASCADE"), nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    evento: Mapped[str] = mapped_column(String(20), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VistaDedup(Base):
    """v15.2 dedup diaria de vistas: 1 conteo por (aviso, IP, día).

    Se guarda el hash SHA256 (nunca la IP en claro). Sin FK (las filas
    sobreviven a la purga del aviso; limpieza por antigüedad).
    """
    __tablename__ = "vistas_dedup"
    __table_args__ = (
        UniqueConstraint("publicacion_id", "marca", name="uq_vista_pub_marca"),
        Index("idx_vistas_dedup_dia", "dia"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publicacion_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    marca: Mapped[str] = mapped_column(String(64), nullable=False)
    dia: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IdempotencyKey(Base):
    """Bloque 2: respuestas guardadas para reintentos seguros (mig 016).

    PK compuesta (clave, usuario_id, ruta): cierra la carrera entre lookup
    e insert (UNIQUE -> replay) y evita fugas entre usuarios.
    """
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        Index("idx_idempotency_expira", "expira_en"),
    )
    clave: Mapped[str] = mapped_column(String(64), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    ruta: Mapped[str] = mapped_column(String(120), primary_key=True)
    codigo: Mapped[int] = mapped_column(Integer, default=201, nullable=False)
    cuerpo: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
