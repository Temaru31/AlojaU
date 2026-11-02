"""Límites de frecuencia en memoria de login, cambio de contraseña y OAuth."""
from fastapi import Request
from app.core.net import ip_de_conexion
from app.core.rate_limit import registrar_intento


# ---------------------------------------------------------------------------
# Rate-limit: memoria (rápido) + persistencia PG (sobrevive reinicios Render).
# Bloqueo temporal 15 min tras 5 fallidos por IP/usuario (v13).
# ---------------------------------------------------------------------------
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
LOGIN_LIMIT = 5
LOGIN_WINDOW_S = 60.0
LOGIN_BLOCK_S = 15 * 60.0

_PW_ATTEMPTS: dict[str, list[float]] = {}
PW_LIMIT = 5
PW_WINDOW_S = 60.0


def _check_password_rate_limit(uid: str) -> None:
    registrar_intento(_PW_ATTEMPTS, uid, PW_LIMIT, PW_WINDOW_S,
                      "Demasiados intentos, espera 1 minuto")


def _check_login_rate_limit(request: Request) -> None:
    registrar_intento(_LOGIN_ATTEMPTS, ip_de_conexion(request), LOGIN_LIMIT, LOGIN_WINDOW_S,
                      "Demasiados intentos de login, espera 1 minuto")


# OAuth Google: tienda SEPARADA del login (un NAT universitario comparte IP;
# los fallos de password no deben bloquear el botón de Google y viceversa).
# 10/min por IP en memoria + persistente 20/15min por IP y 10/15min por email.
_OAUTH_ATTEMPTS: dict[str, list[float]] = {}
OAUTH_LIMIT = 10
OAUTH_WINDOW_S = 60.0


def _check_oauth_rate_limit(request: Request) -> None:
    registrar_intento(_OAUTH_ATTEMPTS, ip_de_conexion(request), OAUTH_LIMIT, OAUTH_WINDOW_S,
                      "Demasiados intentos con Google, espera 1 minuto")
