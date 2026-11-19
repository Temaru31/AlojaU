from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    """Plan de visibilidad (catálogo público)."""
    id: int
    nombre: str
    dias: int
    precio_cop: int
    prioridad: int
    activo: bool


class DestacarIn(BaseModel):
    """Compra de visibilidad v1 (pago manual: pago_ref + aprobación admin)."""
    publicacion_id: int = Field(gt=0, le=1000000)
    plan_id: int = Field(gt=0, le=1000000)
    pago_ref: Optional[str] = Field(default=None, max_length=120)


class DestacadoOut(BaseModel):
    """Destacado con estado (PENDIENTE/ACTIVO/VENCIDO/RECHAZADO)."""
    id: int
    publicacion_id: int
    plan_id: int
    plan_nombre: Optional[str] = None
    inicia: datetime
    vence: datetime
    estado: str
    pago_ref: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None


class AdminDecisionIn(BaseModel):
    """Decisión admin: aprobar->ACTIVO, rechazar->RECHAZADO (+audit)."""
    accion: Literal["aprobar", "rechazar"]
