"""Esquemas Pydantic v2 del chatbot (entrada y salida del endpoint)."""
from typing import Literal

from pydantic import BaseModel, Field

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


class AccionOut(BaseModel):
    etiqueta: str
    ruta: str


class ChatOut(BaseModel):
    respuesta: str
    acciones_sugeridas: list[AccionOut] = Field(default_factory=list)
    deshabilitado: bool = False
    request_id: str
