"""Throttles del chatbot (memoria del proceso + tope diario + circuit breaker).

La ventana deslizante por clave es la común de `core/rate_limit.py`.
- `limite_por_clave(clave, limite, ventana_s)`: 429 (con Retry-After) si
  excede. Claves: `chat:rafaga:{ip}`, `chat:ip:{ip}` y `chat:user:{id}`.
- `limite_por_hora(clave, limite)`: ventana fija de 1 hora con un contador
  por clave (memoria constante por IP, a diferencia de guardar cada marca).
- `turno_en_curso(clave, maximo)`: tope de peticiones simultáneas por IP;
  evita que una sola IP ocupe el proceso con llamadas lentas al proveedor.
- Tope diario global (`chat:dia:YYYY-MM-DD`, configurable): al superarlo se
  abre el circuit breaker hasta el día siguiente y todo responde fallback.
- `registrar_fallo_llm()` / fallos consecutivos >= umbral abren el breaker por
  N minutos (el proveedor caído no cuelga a nadie); `registrar_exito_llm()`
  lo cierra.
- Todo en memoria (Render free = 1 worker; documentado). Limpieza para tests
  con `clear_chat_throttle_for_tests()`. Sin PII en claves (solo ip/id).
"""
import time
from contextlib import contextmanager
from datetime import date

from fastapi import HTTPException

from app.core.rate_limit import MAX_CLAVES, registrar_intento

_THROTTLE: dict[str, list[float]] = {}
_POR_HORA: dict[str, tuple[float, int]] = {}
_EN_CURSO: dict[str, int] = {}
_USO_DIARIO: dict[str, int] = {}
_FALLOS_LLM: dict[str, list[float]] = {"ts": []}
_BREAKER_HASTA: dict[str, float] = {"hasta": 0.0}

MENSAJE_LIMITE = "Demasiadas consultas al asistente, espera un momento."


def clear_chat_throttle_for_tests() -> None:
    _THROTTLE.clear()
    _POR_HORA.clear()
    _EN_CURSO.clear()
    _USO_DIARIO.clear()
    _FALLOS_LLM["ts"] = []
    _BREAKER_HASTA["hasta"] = 0.0


def breaker_abierto() -> bool:
    return time.monotonic() < _BREAKER_HASTA["hasta"]


def _abrir_breaker(segundos: float) -> None:
    _BREAKER_HASTA["hasta"] = time.monotonic() + max(1.0, segundos)


def _demasiadas(espera_s: float) -> HTTPException:
    return HTTPException(status_code=429, detail=MENSAJE_LIMITE,
                         headers={"Retry-After": str(max(1, int(espera_s)))})


def limite_por_clave(clave: str, limite: int, ventana_s: float) -> None:
    """429 si la clave supera `limite` eventos en `ventana_s`."""
    try:
        registrar_intento(_THROTTLE, clave, max(1, int(limite)), ventana_s,
                          MENSAJE_LIMITE)
    except HTTPException:
        raise _demasiadas(ventana_s)


def limite_por_hora(clave: str, limite: int, ventana_s: float = 3600.0) -> None:
    """Ventana fija: como mucho `limite` peticiones por clave y por hora."""
    ahora = time.monotonic()
    if len(_POR_HORA) > MAX_CLAVES:
        for vieja in [c for c, (ini, _) in _POR_HORA.items() if ahora - ini >= ventana_s]:
            del _POR_HORA[vieja]
    inicio, usos = _POR_HORA.get(clave, (ahora, 0))
    if ahora - inicio >= ventana_s:
        inicio, usos = ahora, 0
    if usos >= max(1, int(limite)):
        raise _demasiadas(ventana_s - (ahora - inicio))
    _POR_HORA[clave] = (inicio, usos + 1)


@contextmanager
def turno_en_curso(clave: str, maximo: int):
    """429 si la clave ya tiene `maximo` peticiones en curso; libera al salir."""
    actuales = _EN_CURSO.get(clave, 0)
    if actuales >= max(1, int(maximo)):
        raise _demasiadas(5)
    _EN_CURSO[clave] = actuales + 1
    try:
        yield
    finally:
        restantes = _EN_CURSO.get(clave, 1) - 1
        if restantes > 0:
            _EN_CURSO[clave] = restantes
        else:
            _EN_CURSO.pop(clave, None)


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
