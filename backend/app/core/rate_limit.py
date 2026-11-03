"""Límites de frecuencia: ventana deslizante en memoria y conteo persistente en PG.

En memoria: un `dict[clave, list[timestamps]]` por caso de uso (login, OTP,
subidas...). Vive en el proceso (Render free = 1 worker) y se reinicia al
redeploy. El conteo persistente cubre la fuerza bruta entre reinicios.
Concurrencia: asyncio en un hilo y sin `await` entre leer y escribir el
historial, así que no hay carreras; el riesgo es el tamaño (ver MAX_CLAVES).
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.rate_limit")

Historial = dict[str, list[float]]

MENSAJE_BLOQUEO_PERSISTENTE = "Demasiados intentos. Cuenta bloqueada temporalmente 15 minutos."


# Tope de claves por historial antes de barrer las inactivas: sin él, rotar
# IPs o correos haría crecer el dict sin límite (agotamiento de memoria).
MAX_CLAVES = 10_000


def _podar_inactivas(historial: Historial, ahora: float, ventana_s: float) -> None:
    """Borra las claves sin intentos dentro de la ventana (costo amortizado: solo al pasar el tope)."""
    if len(historial) <= MAX_CLAVES:
        return
    for clave in [c for c, ts in historial.items() if not ts or ahora - ts[-1] >= ventana_s]:
        del historial[clave]


def registrar_intento(historial: Historial, clave: str, limite: int,
                      ventana_s: float, mensaje: str) -> None:
    """Cuenta un intento de `clave`; 429 con `mensaje` si ya hay `limite` en la ventana."""
    ahora = time.monotonic()
    _podar_inactivas(historial, ahora, ventana_s)
    recientes = [t for t in historial.get(clave, []) if ahora - t < ventana_s]
    if len(recientes) >= limite:
        historial[clave] = recientes
        raise HTTPException(status_code=429, detail=mensaje)
    recientes.append(ahora)
    historial[clave] = recientes


async def verificar_intentos_fallidos(db: AsyncSession, clave: str, limite: int = 5,
                                      ventana_s: int = 900) -> None:
    """429 si `clave` acumula `limite` fallos recientes en PG.

    Si la BD falla responde 503 (fail-closed): el anti-fuerza-bruta nunca se
    desactiva en silencio.
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
