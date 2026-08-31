from pydantic import BaseModel, Field
from typing import Optional
# Pydantic v2 - validación estricta Tabla14 Factor1
class PublicacionCreate(BaseModel):
    titulo: str = Field(..., max_length=150)
    tipo_inmueble: str = Field(..., pattern="^(HABITACION_FAMILIAR|HABITACION_INDEPENDIENTE|APARTAESTUDIO|COMPARTIDO)$")
    canon_mensual: float = Field(..., gt=0)
    deposito_requerido: float = 0
    zona_barrio_id: int
    direccion_referencial: str
    # TODO: servicios_ids, fotos (≥3), lat/lng
class PublicacionOut(PublicacionCreate):
    id: int
    estado: str
    indice_confianza: int
    distancia_geodesica_m: Optional[int] = None
