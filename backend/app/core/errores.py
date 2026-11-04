"""Errores de dominio: los lanzan servicios, repositorios y adaptadores.

No conocen HTTP. `main.py` los traduce a una respuesta con `STATUS_HTTP`,
así un script o un job puede usar la misma capa sin depender de FastAPI.
El mensaje es apto para mostrarse al usuario.
"""


class ErrorDeDominio(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


class DatoInvalido(ErrorDeDominio):
    """La petición trae un dato que no se puede aceptar."""


class NoEncontrado(ErrorDeDominio):
    """El recurso pedido (o uno que referencia) no existe."""


class ErrorDeProveedor(ErrorDeDominio):
    """Un servicio externo respondió mal."""


class ServicioNoDisponible(ErrorDeDominio):
    """Falta configuración o una dependencia para atender la petición."""


STATUS_HTTP: dict[type[ErrorDeDominio], int] = {
    DatoInvalido: 400,
    NoEncontrado: 404,
    ErrorDeProveedor: 502,
    ServicioNoDisponible: 503,
}


def status_http(error: ErrorDeDominio) -> int:
    for clase in type(error).__mro__:
        if clase in STATUS_HTTP:
            return STATUS_HTTP[clase]
    return 400
