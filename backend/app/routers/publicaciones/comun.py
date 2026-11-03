"""Utilidades compartidas: límite de publicaciones, ruta de idempotencia del POST y validación de tipo."""
import logging
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
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


async def _exigir_tipo_activo(db: AsyncSession, tipo: str, campo: str) -> None:
    """422 si el slug no existe o está inactivo (catálogo en BD o, sin BD, el estático)."""
    from app.services import housing_types
    if tipo not in await housing_types.slugs_activos(db):
        raise HTTPException(status_code=422, detail=f"{campo} '{tipo}' no válido o inactivo")


def select_con_relaciones():
    """SELECT de avisos con fotos, servicios y zona precargados (lo que pide la tarjeta)."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Publicacion

    return select(Publicacion).options(
        selectinload(Publicacion.imagenes),
        selectinload(Publicacion.servicios),
        selectinload(Publicacion.zona),
    )
