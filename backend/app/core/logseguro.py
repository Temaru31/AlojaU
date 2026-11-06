"""Logs seguros: una línea, sin inyección, sin secretos (CodeQL).

Reglas aplicadas en todo el backend:
- NUNCA interpolar `{e!r}` crudo: los repr de excepción pueden traer saltos
  de línea (log forging) o URLs con tokens (Bot API). Usar `exc_resumen()`.
- NUNCA loguear secretos/OTP/códigos: solo el hecho ("código generado"),
  jamás el valor.
- Valores de request (emails, ids externos, textos) pasan por `una_linea()`
  (sin \\r\\n ni controles, con tope de longitud).
- `exc_info=True` se conserva: el traceback va al stream de error, no al
  mensaje, y no incluye valores de variables.
"""
from __future__ import annotations

import re

_CONTROLES = re.compile(r"[\r\n\x00-\x1f\x7f]")
_MAX = 200


def una_linea(valor, max_len: int = _MAX) -> str:
    """Texto apto para logs: sin saltos/controles, recortado."""
    try:
        s = valor if isinstance(valor, str) else str(valor)
    except Exception:
        return "<no-representable>"
    s = _CONTROLES.sub(" ", s).strip()
    if len(s) > max_len:
        s = s[:max_len] + "…"
    return s


def exc_resumen(exc: BaseException, max_len: int = _MAX) -> str:
    """Resumen de una línea de una excepción (tipo + mensaje saneado)."""
    try:
        return f"{type(exc).__name__}: {una_linea(exc, max_len)}"
    except Exception:
        return "Error"
