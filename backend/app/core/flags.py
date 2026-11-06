"""Interruptores de comportamiento leídos de la configuración en cada llamada."""
from app.core import config


def mock_enabled() -> bool:
    """Tokens de prueba y dev_token habilitados: solo dev/test con USE_MOCK_FALLBACK."""
    return bool(config.settings.mock_enabled)
