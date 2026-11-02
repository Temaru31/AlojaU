"""Normalización de datos de entrada compartida por routers y servicios."""


def normalizar_email(email: str | None) -> str:
    """Email sin espacios y en minúsculas (clave única de usuarios)."""
    return str(email or "").strip().lower()
