"""Idempotencia de POST con el header `Idempotency-Key` (respuesta guardada 24 h).

La PK de `idempotency_keys` es (clave, usuario, ruta): cada endpoint usa su
propia ruta, así una misma clave no colisiona entre endpoints distintos.
"""
import json
import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen

logger = logging.getLogger("alojau.idempotencia")

CLAVE_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
TTL_HORAS = 24


def validar_clave(clave: str | None) -> str | None:
    """Normaliza el header o None si ausente. 422 si malformada.

    En invocación directa (tests/CI) el default de FastAPI llega como
    objeto `Header`, no como None: todo lo no-str se trata como ausente.
    """
    if clave is None or not isinstance(clave, str):
        return None
    clave = clave.strip()
    if not clave:
        return None
    if not CLAVE_RE.match(clave):
        raise HTTPException(status_code=422, detail="Idempotency-Key inválida (8-64 [A-Za-z0-9_-])")
    return clave


async def respuesta_previa(db: AsyncSession, clave: str, uid: int, ruta: str) -> dict | None:
    """Respuesta guardada y vigente, o None.

    Si la tabla no responde se procesa la petición como nueva (con log): la
    idempotencia protege de reintentos, no debe bloquear la escritura.
    """
    try:
        from app.models import IdempotencyKey
        row = await db.get(IdempotencyKey, (clave, uid, ruta))
        if row is None:
            return None
        exp = row.expira_en
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None
        return {"codigo": int(row.codigo), "cuerpo": dict(row.cuerpo)}
    except Exception as e:
        await rollback_seguro(db, "idempotencia.respuesta_previa")
        logger.warning("[idempotencia] lectura de %s falló, se procesa como nueva: %s", ruta, exc_resumen(e))
        return None


async def _purgar_vencidas(db: AsyncSession, IdempotencyKey) -> None:
    """Limpieza best-effort de claves vencidas (tabla acotada)."""
    try:
        await db.execute(
            IdempotencyKey.__table__.delete().where(
                IdempotencyKey.expira_en < datetime.now(timezone.utc))
        )
    except Exception as e:
        logger.warning("[idempotencia] limpieza de claves vencidas falló: %s", exc_resumen(e))


async def guardar_respuesta(db: AsyncSession, clave: str, uid: int, ruta: str, cuerpo: dict) -> dict | None:
    """Guarda la respuesta 201 para replays.

    Devuelve la respuesta ganadora si otro worker guardó primero (carrera) o
    None si guardó limpio. Un fallo al guardar no cambia la respuesta ya dada.
    """
    limpio = json.loads(json.dumps(cuerpo, default=str))
    expira = datetime.now(timezone.utc) + timedelta(hours=TTL_HORAS)
    try:
        from app.models import IdempotencyKey
        await _purgar_vencidas(db, IdempotencyKey)
        db.add(IdempotencyKey(
            clave=clave, usuario_id=uid, ruta=ruta,
            codigo=201, cuerpo=limpio, expira_en=expira,
        ))
        await db.commit()
        return None
    except IntegrityError:
        await rollback_seguro(db, "idempotencia.guardar_respuesta")
        return await respuesta_previa(db, clave, uid, ruta)
    except Exception as e:
        await rollback_seguro(db, "idempotencia.guardar_respuesta")
        logger.warning("[idempotencia] %s no se pudo guardar (se responde igual): %s", ruta, exc_resumen(e))
        return None
