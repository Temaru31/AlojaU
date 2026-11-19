"""Regla de negocio de la verificación del teléfono: independiente del canal.

Hoy la usa el webhook de Telegram (contacto nativo); un canal futuro (SMS,
WhatsApp) aplicaría la misma política sin importar routers:

1. El usuario tiene un número GUARDADO en su perfil.
2. Ni el número ni el identificador del canal están en uso por OTRA cuenta activa.
3. Los últimos 10 dígitos del número probado coinciden con los guardados.

La prueba de titularidad (que el número es de quien escribe) la aporta el canal.
"""
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.core.normalizacion import digitos_nacionales

logger = logging.getLogger("alojau.verificacion")

SIN_TELEFONO = "sin-telefono"
DUPLICADO = "duplicado"
NUMERO_DISTINTO = "numero-distinto"


def contacto_coincide(telefono_probado, whatsapp) -> bool:
    """True si el número probado corresponde al guardado (últimos 10 dígitos)."""
    if not whatsapp:
        return False
    a = digitos_nacionales(telefono_probado)
    b = digitos_nacionales(whatsapp)
    return bool(a) and a == b


async def telefono_o_chat_en_uso(db: AsyncSession, digitos10: str | None,
                                 chat_id: str, excluir_uid: int) -> str | None:
    """Detecta reuso por OTRA cuenta activa. Retorna "telefono", "telegram" o None.

    - Teléfono: otro usuario activo cuyo número termine en los mismos 10
      dígitos (cubre variantes con/sin 57) vía SQL RIGHT().
    - Chat: otro usuario con el mismo `telegram_chat_id`.
    Cuentas en soft-delete (`eliminado_en`) no cuentan (su número se libera).
    Si la BD falla, propaga el error (fail-closed: nunca se vincula sin
    comprobar unicidad).
    """
    from app.models import Usuario
    try:
        if digitos10:
            res = await db.execute(
                select(Usuario.id).where(
                    Usuario.id != excluir_uid,
                    Usuario.eliminado_en.is_(None),
                    Usuario.telefono_whatsapp.is_not(None),
                    func.right(Usuario.telefono_whatsapp, 10) == digitos10,
                ).limit(1)
            )
            if res.scalar() is not None:
                return "telefono"
        res = await db.execute(
            select(Usuario.id).where(
                Usuario.id != excluir_uid,
                Usuario.eliminado_en.is_(None),
                Usuario.telegram_chat_id == str(chat_id),
            ).limit(1)
        )
        if res.scalar() is not None:
            return "telegram"
    except Exception as e:
        logger.error("[verificación] comprobación de unicidad falló: %s", exc_resumen(e))
        raise
    return None


async def motivo_rechazo(db: AsyncSession, usuario, telefono_probado, chat_id: str) -> str | None:
    """Motivo por el que NO se puede verificar (constantes de este módulo), o None si procede."""
    whatsapp = getattr(usuario, "telefono_whatsapp", None)
    if not whatsapp:
        return SIN_TELEFONO
    if await telefono_o_chat_en_uso(db, digitos_nacionales(telefono_probado), str(chat_id), int(usuario.id)):
        return DUPLICADO
    if not contacto_coincide(telefono_probado, whatsapp):
        return NUMERO_DISTINTO
    return None


def marcar_verificado(usuario, chat_id: str) -> None:
    """Deja el teléfono verificado y el canal vinculado (sin commit)."""
    usuario.telegram_chat_id = str(chat_id)
    usuario.telefono_verificado = True
