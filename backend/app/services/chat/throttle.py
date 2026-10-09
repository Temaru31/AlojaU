"""Throttles del chatbot (memoria del proceso + tope diario + circuit breaker).

Mismo molde que `services/telegram.py::check_throttle` (no se importa ese
módulo: el test AST prohíbe servicios ajenos en services/chat/).
- `limite_por_clave(clave, limite, ventana_s)`: 429 si excede. Claves:
  `chat:ip:{ip}` y `chat:user:{id}`.
- Tope diario global (`chat:dia:YYYY-MM-DD`, configurable): al superarlo se
  abre el circuit breaker hasta el día siguiente y todo responde fallback.
- `registrar_fallo_llm()` / fallos consecutivos >= umbral abren el breaker por
  N minutos (el proveedor caído no cuelga a nadie); `registrar_exito_llm()`
  lo cierra.
- Todo en memoria (Render free = 1 worker; documentado). Limpieza para tests
  con `clear_chat_throttle_for_tests()`. Sin PII en claves (solo ip/id).
"""
import time
from datetime import date

from fastapi import HTTPException

_THROTTLE: dict[str, list[float]] = {}
_USO_DIARIO: dict[str, int] = {}
_FALLOS_LLM: dict[str, list[float]] = {"ts": []}
_BREAKER_HASTA: dict[str, float] = {"hasta": 0.0}

MENSAJE_LIMITE = "Demasiadas consultas al asistente, espera un momento."


def clear_chat_throttle_for_tests() -> None:
    _THROTTLE.clear()
    _USO_DIARIO.clear()
    _FALLOS_LLM["ts"] = []
    _BREAKER_HASTA["hasta"] = 0.0


def _podar(clave: str, ventana_s: float, ahora: float) -> list[float]:
    hist = [t for t in _THROTTLE.get(clave, []) if ahora - t < ventana_s]
    _THROTTLE[clave] = hist
    return hist


def breaker_abierto() -> bool:
    return time.monotonic() < _BREAKER_HASTA["hasta"]


def _abrir_breaker(segundos: float) -> None:
    _BREAKER_HASTA["hasta"] = time.monotonic() + max(1.0, segundos)


def limite_por_clave(clave: str, limite: int, ventana_s: float) -> None:
    """429 si la clave supera `limite` eventos en `ventana_s`."""
    ahora = time.monotonic()
    hist = _podar(clave, ventana_s, ahora)
    if len(hist) >= max(1, int(limite)):
        raise HTTPException(status_code=429, detail=MENSAJE_LIMITE)
    hist.append(ahora)
    _THROTTLE[clave] = hist


def tope_diario(limite_dia: int, breaker_s: float = 3600.0) -> None:
    """Tope global diario. Al superarlo abre el breaker y responde 429."""
    if breaker_abierto():
        raise HTTPException(status_code=429, detail=MENSAJE_LIMITE)
    hoy = date.today().isoformat()
    usos = int(_USO_DIARIO.get(hoy, 0)) + 1
    _USO_DIARIO[hoy] = usos
    # Limpia días viejos (memoria acotada).
    for dia in [d for d in _USO_DIARIO if d != hoy]:
        _USO_DIARIO.pop(dia, None)
    if usos > max(1, int(limite_dia)):
        _abrir_breaker(breaker_s)
        raise HTTPException(status_code=429, detail=MENSAJE_LIMITE)


def registrar_exito_llm() -> None:
    _FALLOS_LLM["ts"] = []
    _BREAKER_HASTA["hasta"] = 0.0


def registrar_fallo_llm(max_fallos: int = 5, breaker_s: float = 300.0) -> None:
    """Falla el proveedor: N fallos seguidos abren el breaker (fallback)."""
    ahora = time.monotonic()
    hist = [t for t in _FALLOS_LLM["ts"] if ahora - t < 600.0]
    hist.append(ahora)
    _FALLOS_LLM["ts"] = hist[-max(1, int(max_fallos)):]
    if len(hist) >= max(1, int(max_fallos)):
        _abrir_breaker(breaker_s)
