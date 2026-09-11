from pydantic import BaseModel, Field, ConfigDict, HttpUrl, model_validator
from typing import Optional, Literal, List
from decimal import Decimal
from datetime import datetime

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

    @model_validator(mode="after")
    def lat_lng_both_or_none(self):
        # B0-5: lat/lng both-or-none -> 422 si solo uno presente.
        if (self.latitud is None) != (self.longitud is None):
            raise ValueError("latitud y longitud deben ir juntas (both-or-none)")
        return self


class PublicacionUpdate(BaseModel):
    """Edición parcial del dueño (PATCH /api/publicaciones/{id}).

    Solo campos escalares (sin relaciones): servicios/fotos/zona se editan
    en T3-ciclo-vida. Al menos 1 campo, todos con las mismas cotas que Create.
    El estado NO cambia con la edición (re-moderación llega en T2).
    """

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    titulo: Optional[str] = Field(default=None, min_length=10, max_length=150)
    descripcion: Optional[str] = Field(default=None, min_length=20, max_length=2000)
    tipo_inmueble: Optional[TipoInmueble] = None
    canon_mensual: Optional[Decimal] = Field(default=None, gt=0, le=10_000_000)
    deposito_requerido: Optional[Decimal] = Field(default=None, ge=0)
    direccion_referencial: Optional[str] = Field(default=None, min_length=10, max_length=200)
    reglas_convivencia: Optional[str] = Field(default=None, min_length=10, max_length=1000)

    @model_validator(mode="after")
    def at_least_one(self):
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("Envía al menos 1 campo para editar")
        return self

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


# --- F1 DTOs estrictos (OpenAPI explícito, alias documentados, sin extra="allow") ---
class DesgloseOut(BaseModel):
    """Desglose índice 40+20+15+15+10 (usado en Card/Detail DTOs)."""
    completitud: int
    telefono: int
    fotos: int
    vigencia: int
    reportes: int


class CampusOut(BaseModel):
    """Campus/lugar para GET /api/campus. Ej: {"id": 1, "nombre_sede": "Campus Tulcán", ...}."""
    id: int
    institucion: str
    nombre_sede: str
    latitud: float
    longitud: float
    # 004 POIs (aditivos con default: respuestas viejas/tests sin categoria siguen validando).
    categoria: str = "UNIVERSIDAD"
    direccion: Optional[str] = None
    ciudad_id: Optional[int] = None


class CampusRefOut(BaseModel):
    """Punto de referencia resuelto para GET /api/publicaciones/{id}?campus_id=.

    Permite al Detalle sincronizar el mapa con el lugar buscado (2 pines +
    línea + fitBounds) sin hardcodear coords en el frontend.
    """
    campus_id: int
    institucion: str
    nombre_sede: str
    latitud: float
    longitud: float
    dist_m: Optional[int] = None
    tiempo_pie_min: Optional[int] = None


class PublicacionCardOut(BaseModel):
    """Item de GET /api/publicaciones. Alias compat explícitos (canon, indice, nivel, dist_m, zona)."""

    id: int
    titulo: str
    descripcion: Optional[str] = None
    tipo_inmueble: str
    canon_mensual: float
    canon: float  # alias compat FE legacy
    deposito_requerido: float
    zona_barrio_id: int
    zona: Optional[str] = None  # alias compat
    zona_nombre: Optional[str] = None
    direccion_referencial: Optional[str] = None
    reglas_convivencia: Optional[str] = None
    estado: str
    fecha_renovacion: Optional[datetime] = None
    fecha_expiracion: Optional[datetime] = None
    servicios: List[str] = []
    servicios_ids: List[int] = []
    fotos: List[str] = []
    num_fotos: int = 0
    distancia_geodesica_m: Optional[int] = None
    dist_m: Optional[int] = None  # alias compat
    indice_confianza: int
    indice: int  # alias compat
    desglose: DesgloseOut
    nivel_confianza: str
    nivel: str  # alias compat
    telefono_whatsapp: Optional[str] = None
    usuario_id: int


class PaginatedPublicaciones(BaseModel):
    items: List[PublicacionCardOut]
    total: int
    page: int
    size: int
    pages: int


class PublicacionDetailOut(BaseModel):
    """Detalle GET /api/publicaciones/{id}. Alias compat explícitos."""

    id: int
    titulo: str
    descripcion: Optional[str] = None
    tipo_inmueble: str
    canon_mensual: float
    canon: float  # alias compat
    deposito: float  # alias compat
    deposito_requerido: float
    zona_barrio_id: int
    zona: Optional[str] = None  # alias compat
    zona_nombre: Optional[str] = None
    direccion_referencial: Optional[str] = None
    reglas: Optional[str] = None  # alias compat
    reglas_convivencia: Optional[str] = None
    estado: str
    fecha_renovacion: Optional[datetime] = None
    fecha_expiracion: Optional[datetime] = None
    servicios: List[str] = []
    servicios_ids: List[int] = []
    fotos: List[str] = []
    num_fotos: int = 0
    distancia_geodesica_m: Optional[int] = None
    dist_m: Optional[int] = None  # alias compat
    indice_confianza: int
    indice: int  # alias compat
    desglose: DesgloseOut
    nivel: str
    nivel_confianza: str  # alias compat
    advertencia: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    whatsapp_url: Optional[str] = None
    # Oleada 2: coords del aviso (para mapa + deep-link; null si el dueño no las informó).
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    # 004 POIs: referencia resuelta cuando se pide ?campus_id= (mapa dinámico).
    campus_ref: Optional[CampusRefOut] = None


class PublicacionCreatedOut(BaseModel):
    """Respuesta POST /api/publicaciones (siempre PENDIENTE)."""
    id: int
    estado: str
    indice_confianza: int
    desglose: DesgloseOut
    advertencia: Optional[str] = None
    mensaje: Optional[str] = None


class RenovacionOut(BaseModel):
    """Respuesta PATCH /api/publicaciones/{id}/renovar (PA-01)."""
    id: int
    estado: str
    fecha_expiracion_anterior: datetime
    fecha_expiracion_nueva: datetime
    dias_agregados: int
    mensaje: str
