"""Telegram Bot API: envío de mensajes (DM) sin bloquear el event-loop.

- `send_message_sync`: urllib bloqueante (para contextos sync: OTP).
- `send_message`: wrapper async vía `to_thread` (webhook, notificaciones).
- `throttle_mem`: anti-spam en memoria por clave (webhook), con
  `clear_throttle_for_tests()` para aislar tests.

Este módulo NO importa routers (evita ciclos): recibe el token por
parámetro. La config (BOT_TOKEN) la resuelve el caller.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.parse
import urllib.request

logger = logging.getLogger("alojau.telegram")

# Throttle genérico en memoria: clave -> [timestamps]. El webhook lo usa
# por IP (60/min) para que no se pueda enumerar tokens gratis.
_THROTTLE: dict[str, list[float]] = {}


def clear_throttle_for_tests() -> None:
    _THROTTLE.clear()


def check_throttle(clave: str, limite: int, ventana_s: float, mensaje: str) -> None:
    """Lanza HTTPException 429 si se supera el límite (import tardío)."""
    from fastapi import HTTPException
    ahora = time.monotonic()
    hist = [t for t in _THROTTLE.get(clave, []) if ahora - t < ventana_s]
    if len(hist) >= limite:
        raise HTTPException(status_code=429, detail=mensaje)
    hist.append(ahora)
    _THROTTLE[clave] = hist


def send_message_sync(bot_token: str, chat_id: str, texto: str,
                      timeout_s: float = 5.0) -> bool:
    """POST sendMessage bloqueante. True si Telegram respondió ok.

    Nunca lanza: ante cualquier fallo retorna False (best-effort).
    """
    if not (bot_token or "").strip() or not chat_id:
        return False
    try:
        data = urllib.parse.urlencode(
            {"chat_id": str(chat_id), "text": texto}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token.strip()}/sendMessage",
            data=data, headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            try:
                cuerpo = json.loads(resp.read().decode("utf-8") or "{}")
                return bool(cuerpo.get("ok", True))
            except Exception:
                return True
    except Exception as e:
        logger.warning(f"[telegram send] falló DM: {e!r}")
        return False


async def send_message(bot_token: str, chat_id: str, texto: str,
                       timeout_s: float = 5.0) -> bool:
    """Versión async (no bloquea el loop; timeout 5s, no 8)."""
    try:
        return await asyncio.to_thread(send_message_sync, bot_token, chat_id, texto, timeout_s)
    except Exception as e:
        logger.warning(f"[telegram send async] falló: {e!r}")
        return False
