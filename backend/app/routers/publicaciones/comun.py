"""Utilidades compartidas: límite de publicaciones, idempotencia de POST y validación de tipo."""
import logging
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logseguro import exc_resumen
from sqlalchemy.exc import IntegrityError
import re
from app.core.db_utils import rollback_seguro
from app.core.rate_limit import registrar_intento

logger = logging.getLogger("alojau.publicaciones")

# Anti-flood de creación: 10 publicaciones/hora por usuario (memoria por
# worker). Un aviso legítimo tarda minutos en redactarse; sin esto, una
# cuenta verifica email+teléfono una vez e inunda la cola de moderación y
# la tabla con INSERTs + FK checks. Memoria (no PG): la tabla
# rate_limit_attempts solo cuenta fallidos; aquí se limitan intentos.
_PUB_ATTEMPTS: dict[str, list[float]] = {}
PUB_LIMIT = 10
PUB_WINDOW_S = 3600.0


def clear_pub_rate_limit_for_tests() -> None:
    _PUB_ATTEMPTS.clear()


def _check_pub_rate_limit(uid: int) -> None:
    registrar_intento(_PUB_ATTEMPTS, f"pub:{uid}", PUB_LIMIT, PUB_WINDOW_S,
                      "Demasiadas publicaciones, espera 1 hora")


# Idempotencia de POST /api/publicaciones (solo este endpoint;
# el resto de escrituras sigue sin reintento por defecto en el cliente).
IDEM_RUTA_CREAR = "POST /api/publicaciones"
IDEM_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
IDEM_TTL_HORAS = 24


def _idem_validar(clave: str | None) -> str | None:
    """Normaliza el header o None si ausente. 422 si malformada.

    En invocación directa (tests/CI) el default de FastAPI llega como
    objeto `Header`, no como None: todo lo no-str se trata como ausente.
    """
    if clave is None or not isinstance(clave, str):
        return None
    clave = clave.strip()
    if not clave:
        return None
    if not IDEM_RE.match(clave):
        raise HTTPException(status_code=422, detail="Idempotency-Key inválida (8-64 [A-Za-z0-9_-])")
    return clave


async def _idem_replay(db: AsyncSession, clave: str, uid: int) -> dict | None:
    """Respuesta guardada vigente o None."""
    try:
        from app.models import IdempotencyKey
        row = await db.get(IdempotencyKey, (clave, uid, IDEM_RUTA_CREAR))
        if row is None:
            return None
        exp = row.expira_en
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None
        return {"codigo": int(row.codigo), "cuerpo": dict(row.cuerpo)}
    except HTTPException:
        raise
    except Exception:
        await rollback_seguro(db, "_idem_replay")
        return None


async def _idem_guardar(db: AsyncSession, clave: str, uid: int, cuerpo: dict) -> dict | None:
    """Guarda la respuesta; ante carrera (UNIQUE) devuelve el replay ganador.

    `cuerpo` se sanea a JSON puro (default=str) para no romper el JSONB.
    Retorna el replay en caso de colisión o None si guardó limpio.
    """
    import json as _json
    limpio = _json.loads(_json.dumps(cuerpo, default=str))
    expira = datetime.now(timezone.utc) + timedelta(hours=IDEM_TTL_HORAS)
    try:
        from app.models import IdempotencyKey
        # Limpieza best-effort de vencidas (tabla acotada).
        try:
            await db.execute(
                IdempotencyKey.__table__.delete().where(
                    IdempotencyKey.expira_en < datetime.now(timezone.utc))
            )
        except Exception as e:
            logger.warning("[idempotencia] limpieza de claves vencidas falló: %s", exc_resumen(e))
        db.add(IdempotencyKey(
            clave=clave, usuario_id=uid, ruta=IDEM_RUTA_CREAR,
            codigo=201, cuerpo=limpio, expira_en=expira,
        ))
        await db.commit()
        return None
    except IntegrityError:
        # Carrera perdida: otro worker guardó primero -> replay ganador.
        await rollback_seguro(db, "_idem_guardar")
        return await _idem_replay(db, clave, uid)
    except Exception as e:
        await rollback_seguro(db, "_idem_guardar")
        logger.warning(f"[idempotencia] no se pudo guardar (se responde igual): {exc_resumen(e)}")
        return None


async def _exigir_tipo_activo(db: AsyncSession, tipo: str, campo: str) -> None:
    """422 si el slug no existe o está inactivo (catálogo en BD o, sin BD, el estático)."""
    from app.services import housing_types
    if tipo not in await housing_types.slugs_activos(db):
        raise HTTPException(status_code=422, detail=f"{campo} '{tipo}' no válido o inactivo")
