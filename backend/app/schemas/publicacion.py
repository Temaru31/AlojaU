from pydantic import BaseModel, Field, ConfigDict, HttpUrl
from typing import Optional, Literal
from decimal import Decimal

TipoInmueble = Literal["HABITACION_FAMILIAR","HABITACION_INDEPENDIENTE","APARTAESTUDIO","COMPARTIDO"]

class PublicacionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    titulo: str = Field(min_length=10, max_length=150)
    descripcion: str = Field(min_length=20, max_length=2000)
    tipo_inmueble: TipoInmueble
    canon_mensual: Decimal = Field(gt=0, le=10_000_000)
    deposito_requerido: Decimal = Field(ge=0, default=0)
    zona_barrio_id: int = Field(gt=0)
    direccion_referencial: str = Field(min_length=10, max_length=200)
    reglas_convivencia: str = Field(min_length=10, max_length=1000)
    latitud: Optional[float] = Field(ge=-90, le=90, default=None)
    longitud: Optional[float] = Field(ge=-180, le=180, default=None)
    servicios_ids: list[int] = Field(min_length=1)
    campus_ids: list[int] = Field(min_length=1)
    fotos: list[HttpUrl] = Field(min_length=3, max_length=10, description="≥3 fotos HU-005 C2")
    incluye_servicios_base: bool = True

class DesgloseConfianza(BaseModel):
    completitud: int
    telefono: int
    fotos: int
    vigencia: int
    reportes: int

class PublicacionOut(BaseModel):
    id: int
    titulo: str
    tipo_inmueble: str
    canon_mensual: float
    deposito_requerido: float
    zona_nombre: Optional[str] = None
    direccion_referencial: str
    estado: str
    servicios: list[str] = []
    fotos: list[str] = []
    num_fotos: int = 0
    distancia_geodesica_m: Optional[int] = None
    indice_confianza: int = 0
    desglose: Optional[DesgloseConfianza] = None
    nivel_confianza: str = "basico"
    advertencia_confianza: str = "Informativo, no garantiza seguridad. Verificar antes de pagar."
    telefono_whatsapp: Optional[str] = None
    whatsapp_url: Optional[str] = None
    fecha_renovacion: Optional[str] = None
    fecha_expiracion: Optional[str] = None
