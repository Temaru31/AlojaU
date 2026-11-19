"""Normalización de datos de entrada compartida por routers y servicios."""
import re


def normalizar_email(email: str | None) -> str:
    """Email sin espacios y en minúsculas (clave única de usuarios)."""
    return str(email or "").strip().lower()


def digitos_nacionales(raw: str | None) -> str | None:
    """Últimos 10 dígitos para COMPARAR (no para guardar).

    El canónico de BD sigue siendo E.164 de `normalizar_telefono` (wa.me,
    CHECKs, migración 009): cambiarlo rompería enlaces y respuestas API.
    Para verificar se comparan los últimos 10 dígitos, tolerando "con/sin
    código país" y el formato crudo que devuelve Telegram (tdlib advierte
    que `contact.phone_number` puede llegar sin normalizar).
    Retorna None si hay menos de 10 dígitos (no verificable por este medio).
    """
    d = re.sub(r"\D", "", str(raw or ""))
    if len(d) < 10:
        return None
    return d[-10:]
