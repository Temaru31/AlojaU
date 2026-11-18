"""Allowlist de rutas internas de AlojaU usable por respuestas y acciones.

Módulo sin dependencias para que `respuestas.py` pueda validar sus botones
sin importar el orquestador (evita ciclos).
"""

RUTAS_PERMITIDAS = frozenset({
    "/", "/comparar", "/favoritos", "/alertas", "/recuperar", "/publicar",
    "/terminos", "/privacidad", "/roomies", "/perfil", "/mis-publicaciones",
    "/publicitar",
})


def ruta_permitida(ruta: str) -> bool:
    """Allowlist pública de rutas para acciones."""
    return str(ruta or "") in RUTAS_PERMITIDAS
