"""Límites de frecuencia: ventana deslizante en memoria y conteo persistente en PG.

En memoria: un `dict[clave, list[timestamps]]` por caso de uso (login, OTP,
subidas...). Vive en el proceso (Render free = 1 worker) y se reinicia al
redeploy. El conteo persistente cubre la fuerza bruta entre reinicios.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db_utils import rollback_seguro
from app.core.flags import mock_enabled
from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.rate_limit")

Historial = dict[str, list[float]]

MENSAJE_BLOQUEO_PERSISTENTE = "Demasiados intentos. Cuenta bloqueada temporalmente 15 minutos."


def registrar_intento(historial: Historial, clave: str, limite: int,
                      ventana_s: float, mensaje: str) -> None:
    """Cuenta un intento de `clave`; 429 con `mensaje` si ya hay `limite` en la ventana."""
    ahora = time.monotonic()
    recientes = [t for t in historial.get(clave, []) if ahora - t < ventana_s]
    if len(recientes) >= limite:
        historial[clave] = recientes
        raise HTTPException(status_code=429, detail=mensaje)
    recientes.append(ahora)
    historial[clave] = recientes


async def verificar_intentos_fallidos(db: AsyncSession, clave: str, limite: int = 5,
                                      ventana_s: int = 900) -> None:
    """429 si `clave` acumula `limite` fallos recientes en PG.

    Si la BD falla: en dev/mock se avisa y rige solo el límite en memoria; en
    prod responde 503 (nunca se desactiva el anti-fuerza-bruta en silencio).
    """
    from app.models import RateLimitAttempt
    try:
        corte = datetime.now(timezone.utc) - timedelta(seconds=ventana_s)
        stmt = select(func.count()).select_from(RateLimitAttempt).where(
            RateLimitAttempt.clave == clave,
            RateLimitAttempt.exito.is_(False),
            RateLimitAttempt.creado_en >= corte,
        )
        fallos = (await db.execute(stmt)).scalar() or 0
    except Exception as e:
        await rollback_seguro(db, "verificar_intentos_fallidos")
        logger.error("[rate-limit] verificación persistente falló (fail-closed): %s", exc_resumen(e))
        if mock_enabled():
            logger.warning("[rate-limit] sin PG en dev: solo rige el límite en memoria")
            return
        raise HTTPException(status_code=503, detail="Servicio de protección no disponible")
    if fallos >= limite:
        raise HTTPException(status_code=429, detail=MENSAJE_BLOQUEO_PERSISTENTE)


async def registrar_intento_persistente(db: AsyncSession, clave: str, exito: bool) -> None:
    """Guarda el intento. Best-effort: un fallo aquí nunca tumba un login legítimo."""
    from app.models import RateLimitAttempt
    try:
        db.add(RateLimitAttempt(clave=clave[:180], exito=bool(exito)))
        await db.commit()
    except Exception as e:
        await rollback_seguro(db, "registrar_intento_persistente")
        logger.warning("[rate-limit] no se pudo registrar intento: %s", exc_resumen(e))
