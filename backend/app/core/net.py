"""IP del cliente: fuente única para auditoría (Ley 1581), throttles y vistas.

Dos nociones distintas, a propósito:
- `client_ip`: IP declarada por la cadena de proxies (X-Forwarded-For,
  X-Real-IP) con respaldo en la conexión. Sirve para registrar consentimiento
  y para límites blandos; un cliente puede influir en ella enviando su propio
  X-Forwarded-For, así que no debe ser la única barrera de un límite duro.
- `ip_de_conexion`: el par TCP directo (`request.client.host`). No se puede
  falsificar con cabeceras, pero detrás de un proxy es la IP del proxy.
- `ip_para_limites`: la que usan los límites duros (login, OAuth, reportes).
  Con `TRUSTED_PROXY_HOPS` proxies de confianza toma la IP que añadió el
  proxy más externo; sin proxies configurados, la de la conexión.
"""
import ipaddress

from app.core import config

DESCONOCIDA = "unknown"
_MAX_LARGO_IP = 45


def ip_valida(texto: str | None) -> str | None:
    """IPv4/IPv6 sin zona ni puerto; None si no es IP o es loopback/0.0.0.0."""
    candidata = (texto or "").strip().split("%")[0]
    try:
        ip = ipaddress.ip_address(candidata)
    except ValueError:
        return None
    if ip.is_loopback or ip.is_unspecified:
        return None
    return candidata[:_MAX_LARGO_IP]


def client_ip(request) -> str:
    """Primera IP válida de X-Forwarded-For, luego X-Real-IP, luego la conexión."""
    headers = getattr(request, "headers", None) if request else None
    if headers is not None:
        for parte in str(headers.get("x-forwarded-for") or "").split(","):
            ip = ip_valida(parte)
            if ip:
                return ip
        ip = ip_valida(headers.get("x-real-ip"))
        if ip:
            return ip
    conexion = ip_de_conexion(request)
    return ip_valida(conexion) or conexion


def ip_para_limites(request) -> str:
    """IP del cliente que no se puede falsificar con cabeceras.

    Cada proxy AÑADE al final de X-Forwarded-For la IP que lo contactó; lo de
    la izquierda lo escribe el cliente. Con N proxies de confianza delante de
    la app, el cliente real es la entrada N-ésima contando desde la derecha.
    Sin proxies configurados, o si la cabecera no tiene esas entradas, se usa
    la IP de la conexión.
    """
    saltos = max(0, int(config.settings.TRUSTED_PROXY_HOPS or 0))
    if saltos:
        headers = getattr(request, "headers", None) if request else None
        cadena = [p.strip() for p in str((headers or {}).get("x-forwarded-for") or "").split(",") if p.strip()]
        if len(cadena) >= saltos:
            ip = ip_valida(cadena[-saltos])
            if ip:
                return ip
    return ip_de_conexion(request)


def ip_de_conexion(request) -> str:
    """Host del par TCP directo, o "unknown" si no hay conexión."""
    host = getattr(getattr(request, "client", None), "host", None)
    return str(host)[:_MAX_LARGO_IP] if host else DESCONOCIDA
