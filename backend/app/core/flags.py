"""Interruptores de comportamiento leídos de la configuración en cada llamada."""
from app.core import config


def mock_enabled() -> bool:
    """Datos en memoria permitidos: solo dev/test con USE_MOCK_FALLBACK (nunca prod)."""
    return bool(config.settings.mock_enabled)
