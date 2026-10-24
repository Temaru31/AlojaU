"""Esquemas Pydantic v2 del chatbot (entrada, tools y salida).

Todo lo que genera el LLM se valida aquí como entrada NO CONFIABLE
(`extra="forbid"`, rangos, literales cerrados, longitudes). Ningún argumento
llega crudo a las consultas.
"""
from typing import Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Entrada / salida del endpoint
# --------------------------------------------------------------------------

ROLES_HISTORIAL = ("user", "assistant")


class TurnoIn(BaseModel):
    model_config = {"extra": "forbid"}

    rol: Literal["user", "assistant"]
    texto: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    model_config = {"extra": "forbid"}

    mensaje: str = Field(min_length=1, max_length=500)
    historial: list[TurnoIn] = Field(default_factory=list, max_length=32)
    conversacion_id: str | None = Field(default=None, max_length=64)


class TarjetaOut(BaseModel):
    id: int
    titulo: str
    precio: float | None = None
    tipo: str | None = None
    zona: str | None = None
    distancia_m: int | None = None
    indice_confianza: int | None = None
    nivel_confianza: str | None = None
    foto: str | None = None
    url: str


class AccionOut(BaseModel):
    etiqueta: str
    ruta: str


class ChatOut(BaseModel):
    respuesta: str
    tarjetas: list[TarjetaOut] = Field(default_factory=list)
    acciones_sugeridas: list[AccionOut] = Field(default_factory=list)
    deshabilitado: bool = False
    request_id: str


# --------------------------------------------------------------------------
# Argumentos de tools (allowlist cerrada, todo acotado)
# --------------------------------------------------------------------------

class BuscarArgs(BaseModel):
    model_config = {"extra": "forbid"}

    q: str | None = Field(default=None, max_length=100)
    campus_id: int | None = Field(default=None, ge=1, le=1_000_000)
    ciudad_id: int | None = Field(default=None, ge=1, le=1_000_000)
    precio_min: float | None = Field(default=None, ge=0, le=10_000_000)
    precio_max: float | None = Field(default=None, ge=0, le=10_000_000)
    tipo: str | None = Field(default=None, max_length=40)
    servicio_ids: list[int] = Field(default_factory=list, max_length=10)
    ordenar: Literal["recientes", "precio", "distancia", "confianza"] = "recientes"


class PublicacionArgs(BaseModel):
    model_config = {"extra": "forbid"}

    pub_id: int = Field(ge=1, le=1_000_000)


class CatalogoArgs(BaseModel):
    model_config = {"extra": "forbid"}

    catalogo: Literal["campus", "ciudades", "zonas", "tipos", "servicios"]
    ciudad_id: int | None = Field(default=None, ge=1, le=1_000_000)


class ConfianzaArgs(BaseModel):
    model_config = {"extra": "forbid"}

    pub_id: int = Field(ge=1, le=1_000_000)


class FaqArgs(BaseModel):
    model_config = {"extra": "forbid"}

    pregunta: str = Field(min_length=2, max_length=200)


TOOLS_ALLOWLIST = (
    "buscar_publicaciones",
    "obtener_publicacion",
    "listar_catalogos",
    "explicar_indice_confianza",
    "buscar_en_faq",
)

ESQUEMAS_TOOL = {
    "buscar_publicaciones": BuscarArgs,
    "obtener_publicacion": PublicacionArgs,
    "listar_catalogos": CatalogoArgs,
    "explicar_indice_confianza": ConfianzaArgs,
    "buscar_en_faq": FaqArgs,
}
