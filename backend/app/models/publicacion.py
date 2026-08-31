"""Modelos SQLAlchemy - ver schema.sql"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Text, Numeric, Boolean, ForeignKey, SmallInteger, TIMESTAMP, func
from ..db.base import Base

class Ciudad(Base):
    __tablename__="ciudades"
    id: Mapped[int]=mapped_column(primary_key=True)
    nombre: Mapped[str]=mapped_column(String(100), unique=True)
    departamento: Mapped[str]=mapped_column(String(100))

class ZonaBarrio(Base):
    __tablename__="zonas_barrios"
    id: Mapped[int]=mapped_column(primary_key=True)
    ciudad_id: Mapped[int]=mapped_column(ForeignKey("ciudades.id"))
    nombre: Mapped[str]=mapped_column(String(120))
    estrato: Mapped[int]=mapped_column(SmallInteger, nullable=True)

class CampusUniversitario(Base):
    __tablename__="campus_universitarios"
    id: Mapped[int]=mapped_column(primary_key=True)
    ciudad_id: Mapped[int]=mapped_column(ForeignKey("ciudades.id"))
    institucion: Mapped[str]=mapped_column(String(150))
    nombre_sede: Mapped[str]=mapped_column(String(150))
    direccion: Mapped[str]=mapped_column(String(200))
    latitud: Mapped[float]=mapped_column(Numeric(10,7))
    longitud: Mapped[float]=mapped_column(Numeric(10,7))
    activo: Mapped[bool]=mapped_column(Boolean, default=True)
