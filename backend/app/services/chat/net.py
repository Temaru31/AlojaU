"""IP real del cliente detrás de proxy (Render) para rate-limit del chatbot.

Réplica pura de la lógica de `routers/auth.py::_client_ip` (no se importa
ese módulo: contiene endpoints de escritura). Precedencia: 1) X-Forwarded-For
(primera IP válida: la pone Render), 2) X-Real-IP, 3) request.client.host.

Anti-evasión: cada candidata se valida como IP (basura/puertos/hostnames se
ignoran, así rotar el header no abre buckets nuevos). Un atacante tras el
mismo proxy solo podría suplantar OTRA ip válida, nunca infinitas: el tope
diario global + circuit breaker acotan ese caso. Modelo de confianza
documentado en docs/CHATBOT.md (Fase 4).
"""
import ipaddress


def _ip_valida(txt: str | None) -> str | None:
    try:
        cand = (txt or "").strip().split("%")[0]
        ip = ipaddress.ip_address(cand)
        if ip.is_loopback or ip.is_unspecified:
            return None
        return cand[:45]
    except Exception:
        return None


def ip_cliente(request) -> str:
    """Extrae la IP o 'unknown'. Nunca lanza."""
    try:
        headers = getattr(request, "headers", None) if request else None
        if headers is not None:
            fwd = headers.get("x-forwarded-for")
            if fwd:
                for parte in str(fwd).split(","):
                    ip = _ip_valida(parte)
                    if ip:
                        return ip
            real = headers.get("x-real-ip")
            if real:
                ip = _ip_valida(real)
                if ip:
                    return ip
        cliente = getattr(getattr(request, "client", None), "host", None)
        if cliente:
            return _ip_valida(cliente) or str(cliente)[:45]
    except Exception:
        pass
    return "unknown"
