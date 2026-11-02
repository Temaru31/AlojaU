"""Vocabulario cerrado del dominio (espejo de los CHECK de db/schema.sql).

`StrEnum`: cada miembro ES un `str` (`Rol.ADMIN == "ADMIN"`), así que se
compara, serializa a JSON y se persiste igual que el literal que reemplaza.
"""
from enum import StrEnum

# Días que una cuenta auto-eliminada puede restaurarse antes de la purga física.
DIAS_GRACIA_CUENTA = 30


class Rol(StrEnum):
    ESTUDIANTE = "ESTUDIANTE"
    ARRENDADOR = "ARRENDADOR"
    ADMIN = "ADMIN"
    MODERADOR_CAMPUS = "MODERADOR_CAMPUS"
    AUDITOR_LEGAL = "AUDITOR_LEGAL"


class EstadoPublicacion(StrEnum):
    PENDIENTE = "PENDIENTE"
    ACTIVO = "ACTIVO"
    PAUSADO = "PAUSADO"
    PAUSADO_POR_REPORTE = "PAUSADO_POR_REPORTE"
    REVISION_REQUERIDA = "REVISION_REQUERIDA"
    RECHAZADO = "RECHAZADO"
    ARRENDADO = "ARRENDADO"
    EXPIRADO = "EXPIRADO"
    DESACTIVADO = "DESACTIVADO"


class EstadoReporte(StrEnum):
    PENDIENTE = "PENDIENTE"
    CONFIRMADO = "CONFIRMADO"
    DESCARTADO = "DESCARTADO"


class EstadoDestacado(StrEnum):
    PENDIENTE = "PENDIENTE"
    ACTIVO = "ACTIVO"
    VENCIDO = "VENCIDO"
    RECHAZADO = "RECHAZADO"
