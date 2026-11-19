"""Centro de notificaciones: eventos de dominio -> canales.

Diseño extensible (ver docs/NOTIFICACIONES.md):
- Los routers NO hablan con Telegram/email directamente: emiten un evento
  (`notificar_cambio_estado(...)`, a futuro `notificar_nuevo_arriendo(...)`).
- Cada canal implementa `CanalNotificacion`: su `nombre`, cómo resuelve el
  destino del usuario (`destino_para`) y `enviar(destino, texto)`.
  Hoy: Telegram DM + Log. Futuro: Email (SMTP/Supabase), Web Push.
- Las preferencias por usuario (`notificacion_preferencias`, futura tabla)
  decidirán qué canal usar; hoy: Telegram si hay chat vinculado, si no
  queda el aviso dentro de la app (banner de Mis publicaciones).
- Todo es best-effort: una notificación jamás rompe el 200 del endpoint.

Uso:
    from app.services import notifications as _nt
    await _nt.notificar_cambio_estado(db, usuario_id=1, titulo="...", estado="ACTIVO")
"""
from __future__ import annotations

import logging
from typing import Protocol
from app.core.logseguro import exc_resumen, una_linea
from app.core.dominio import EstadoPublicacion

logger = logging.getLogger("alojau.notificaciones")

# Lenguaje humano por estado (fuente única backend; el frontend tiene su
# espejo en HistorialAvisos/infoEvento y MisPublicaciones/ESTADO_LABEL).
MENSAJE_ESTADO_DUENO: dict[str, str] = {
    EstadoPublicacion.ACTIVO: "¡Buenas noticias! Tu anuncio «{titulo}» fue aprobado y ya es visible en AlojaU.",
    EstadoPublicacion.RECHAZADO: "Tu anuncio «{titulo}» no fue aprobado en esta revisión. Entra a Mis publicaciones para ver el detalle y volver a intentarlo.",
    EstadoPublicacion.PAUSADO: "Tu anuncio «{titulo}» fue pausado por el equipo de AlojaU. Escríbenos si tienes dudas.",
}


class CanalNotificacion(Protocol):
    """Contrato de canal. `destino_para` devuelve None si el usuario no es
    alcanzable por este canal; `enviar` retorna True si el mensaje salió."""

    nombre: str

    async def destino_para(self, db, usuario_id: int) -> str | None: ...

    async def enviar(self, destino: str, texto: str) -> bool: ...


class CanalTelegram:
    """DM por Bot API (async, sin bloquear el loop). Sin token/chat -> False."""

    nombre = "telegram"

    async def destino_para(self, db, usuario_id: int) -> str | None:
        # Solo DM vinculado: sin chat el usuario no es alcanzable por Telegram.
        return await _chat_vinculado(db, usuario_id)

    async def enviar(self, destino: str, texto: str) -> bool:
        try:
            from app.core.config import settings as _settings
            from app.services import telegram as _tg
            token = (getattr(_settings, "TELEGRAM_BOT_TOKEN", "") or "").strip()
            return await _tg.send_message(token, destino, texto)
        except Exception as e:
            logger.warning(f"[notificaciones telegram] falló: {exc_resumen(e)}")
            return False


class CanalLog:
    """Canal de respaldo/observabilidad: deja traza en logs (saneada)."""

    nombre = "log"

    async def destino_para(self, db, usuario_id: int) -> str | None:
        return f"usuario:{usuario_id}"

    async def enviar(self, destino: str, texto: str) -> bool:
        logger.info(f"[notificaciones log] para {una_linea(destino, 40)}: {una_linea(texto, 120)}")
        return True


async def _chat_vinculado(db, usuario_id: int) -> str | None:
    """chat_id del dueño o None (nunca grupos: solo DM vinculado)."""
    try:
        from app.models import Usuario
        u = await db.get(Usuario, usuario_id)
        chat = getattr(u, "telegram_chat_id", None) if u is not None else None
        return str(chat) if chat else None
    except Exception as e:
        logger.warning("[notificaciones] lectura del chat vinculado falló: %s", exc_resumen(e))
        return None


async def despachar(db, usuario_id: int | None, texto: str,
                    canales: list | None = None) -> dict:
    """Envía `texto` al usuario por los canales dados. Retorna {canal.nombre: ok}.

    Nunca lanza: cada canal falla de forma aislada (best-effort). Un canal
    sin destino para el usuario (p. ej. Telegram sin chat vinculado) da False.
    """
    resultado: dict[str, bool] = {}
    if not isinstance(usuario_id, int) or not texto:
        return resultado
    for canal in (canales if canales is not None else [CanalTelegram()]):
        nombre = canal.nombre
        try:
            destino = await canal.destino_para(db, usuario_id)
            resultado[nombre] = bool(destino) and bool(await canal.enviar(destino, texto))
        except Exception as e:
            logger.warning(f"[notificaciones {nombre}] falló: {exc_resumen(e)}")
            resultado[nombre] = False
    return resultado


async def notificar_cambio_estado(db, usuario_id: int | None,
                                  titulo: str, estado: str) -> str:
    """Avisa aprobación/rechazo/pausa. Retorna canal usado o "none".

    Wrapper de compatibilidad sobre despachar() para el flujo de moderación.
    """
    plantilla = MENSAJE_ESTADO_DUENO.get(estado)
    if not plantilla or not isinstance(usuario_id, int):
        return "none"
    texto = plantilla.format(titulo=titulo or "tu aviso")
    try:
        res = await despachar(db, usuario_id, texto)
        if res.get(CanalTelegram.nombre):
            return CanalTelegram.nombre
    except Exception as e:
        logger.warning(f"[notificaciones cambio-estado] falló: {exc_resumen(e)}")
    return "none"
