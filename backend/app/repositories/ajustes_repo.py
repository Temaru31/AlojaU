"""Ajustes del sistema (tabla system_settings) con `DEFAULTS` como respaldo.

Fuente única para leer y escribir ajustes: una consulta trae la tabla entera
(son pocas filas) y queda en caché 5 minutos; guardar la invalida. Si la BD
falla se sirven los DEFAULTS sin cachearlos, para que un fallo transitorio no
deje valores por defecto pegados durante 5 minutos.
"""
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.models import SystemSetting
from app.services.config_sistema import DEFAULTS

logger = logging.getLogger("alojau.ajustes")

TTL_CACHE_S = 300
_cache: dict = {"ts": 0.0, "valores": None}


def limpiar_cache() -> None:
    """Olvida los valores en memoria (tras guardar, y entre pruebas)."""
    _cache["ts"] = 0.0
    _cache["valores"] = None


def valores_por_defecto() -> dict[str, str]:
    return {clave: valor for clave, (valor, _tipo, _desc, _sec) in DEFAULTS.items()}


def _desde_cache() -> dict[str, str] | None:
    vigente = time.monotonic() - _cache["ts"] < TTL_CACHE_S
    return _cache["valores"] if vigente else None


async def leer_todos(db: AsyncSession) -> dict[str, str]:
    """Valor de cada clave conocida: el de la BD si existe, si no el default."""
    en_cache = _desde_cache()
    if en_cache is not None:
        return dict(en_cache)
    valores = valores_por_defecto()
    try:
        # SAVEPOINT: si la lectura falla solo se deshace ella, no el trabajo
        # pendiente de quien llama (p. ej. el aviso recién creado).
        async with db.begin_nested():
            filas = (await db.execute(select(SystemSetting.clave, SystemSetting.valor))).all()
    except Exception as e:
        logger.warning("[ajustes] lectura desde BD falló, se usan DEFAULTS: %s", exc_resumen(e))
        return valores
    valores.update({clave: valor for clave, valor in filas if clave in valores})
    _cache["valores"], _cache["ts"] = valores, time.monotonic()
    return dict(valores)


def _default_de(clave: str) -> str:
    return DEFAULTS[clave][0]


async def leer(db: AsyncSession, clave: str) -> str:
    return (await leer_todos(db)).get(clave, _default_de(clave))


def entero(valores: dict[str, str], clave: str) -> int:
    """Valor entero de `valores`; si no es un número válido, el default."""
    try:
        return int(valores.get(clave, _default_de(clave)))
    except ValueError:
        return int(_default_de(clave))


def booleano(valores: dict[str, str], clave: str) -> bool:
    return str(valores.get(clave, _default_de(clave))).strip().lower() == "true"


async def leer_entero(db: AsyncSession, clave: str) -> int:
    return entero(await leer_todos(db), clave)


async def leer_bool(db: AsyncSession, clave: str) -> bool:
    return booleano(await leer_todos(db), clave)


async def guardar(db: AsyncSession, clave: str, valor: str) -> str | None:
    """Crea o actualiza el ajuste (sin commit). Devuelve el valor anterior.

    Quien llama hace commit y luego `limpiar_cache()`.
    """
    _valor, tipo, descripcion, _seccion = DEFAULTS[clave]
    fila = (await db.execute(select(SystemSetting).where(SystemSetting.clave == clave))).scalars().first()
    if fila is None:
        db.add(SystemSetting(clave=clave, valor=valor, tipo=tipo, descripcion=descripcion))
        return None
    anterior = fila.valor
    fila.valor = valor
    fila.actualizado_en = datetime.now(timezone.utc)
    return anterior
