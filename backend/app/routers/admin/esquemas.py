"""Contratos Pydantic del panel admin."""
from typing import Literal
from pydantic import BaseModel, Field


class MetricasOut(BaseModel):
    total_publicaciones: int = 0
    activas: int = 0
    pendientes: int = 0
    reportes_activos: int = 0
    reportes_pendientes: int = 0
    # Aditivo: inmuebles distintos con al menos 1 reporte PENDIENTE
    # (COUNT DISTINCT publicacion_id WHERE estado='PENDIENTE').
    # `reportes_activos` se mantiene intacto (denuncias totales acumuladas).
    inmuebles_con_reportes: int = 0
    arrendadores_verificados: int = 0
    total_usuarios: int = 0


class CambioEstadoIn(BaseModel):
    estado: Literal["ACTIVO", "RECHAZADO", "PAUSADO"] = Field(
        description="aprobar->ACTIVO, rechazar->RECHAZADO, pausar->PAUSADO"
    )


class BulkEstadoIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)
