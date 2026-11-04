"""Envío de mensajes por la Bot API de Telegram (best-effort)."""
from app.core.config import settings


def _telegram_send_message(chat_id: str, texto: str) -> bool:
    """Envía un DM por Bot API. Retorna True si Telegram respondió 200/ok.

    Usado por el webhook (confirmación) y por OTP (códigos).
    Nunca lanza: ante fallo retorna False y loguea (fallback a email).
    Delega en services/telegram (fuente única; este wrapper conserva el
    contrato para callers sync existentes).
    """
    from app.services import telegram as _tg
    token = (getattr(settings, "TELEGRAM_BOT_TOKEN", "") or "").strip()
    return _tg.send_message_sync(token, chat_id, texto)


async def _telegram_send_message_async(chat_id: str, texto: str,
                                         reply_markup: dict | None = None) -> bool:
    """Versión async (no bloquea el loop): webhook y notificaciones."""
    from app.services import telegram as _tg
    token = (getattr(settings, "TELEGRAM_BOT_TOKEN", "") or "").strip()
    return await _tg.send_message(token, chat_id, texto, reply_markup=reply_markup)
