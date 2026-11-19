"""Calcula índice confianza 0-100 (40+20+15+15+10) con desglose y nivel.
Uso: routers/publicaciones.py::crear/list/detalle.
Ej: calcular_indice(..., telefono_verificado=True, num_fotos=4, dias_vigencia=5, reportes_activos=0) -> {"indice": 95, ...}."""

from datetime import datetime, timezone
from typing import Optional
from app.core.config import settings
from app.services.housing_types import FALLBACK_TIPOS

DISCLAIMER = "Informativo, no garantiza seguridad. Verificar antes de pagar."

# Allowlist de los tipos del seed para un cálculo síncrono sin E/S; la validación
# de escritura usa la tabla housing_types (esta_activo=true) con caché de 5 min.
_TIPOS_VALIDOS = frozenset(t["slug"] for t in FALLBACK_TIPOS)


def _texto_suficiente(texto: Optional[str]) -> bool:
    return bool(texto) and len(texto.strip()) >= 10


def _puntos_completitud(*, canon_mensual, deposito_requerido, tipo_inmueble, reglas_convivencia,
                        direccion_referencial, servicios_ids, peso: int) -> int:
    """Factor 1, completitud (40 puntos base, desglose fino de la Tabla 16)."""
    crudo = (
        (10 if canon_mensual is not None and canon_mensual > 0 else 0)
        + (5 if deposito_requerido is not None else 0)  # 0 explícito cuenta
        + (5 if tipo_inmueble in _TIPOS_VALIDOS else 0)
        + (5 if _texto_suficiente(reglas_convivencia) else 0)
        + (5 if _texto_suficiente(direccion_referencial) else 0)
        + (10 if servicios_ids and len(servicios_ids) >= 1 else 0)
    )
    return int(round((crudo / 40.0) * peso)) if peso != 40 else crudo


def _nivel(score: int) -> str:
    if score >= 80:
        return "alto"
    if score >= 50:
        return "medio"
    return "basico"


def calcular_indice(
    *,
    # Factor1 completitud (40)
    canon_mensual: Optional[float],
    deposito_requerido: Optional[float],  # 0 si no aplica, pero debe ser explícito
    tipo_inmueble: Optional[str],
    reglas_convivencia: Optional[str],
    direccion_referencial: Optional[str],
    servicios_ids: Optional[list],
    titulo: Optional[str] = None,
    descripcion: Optional[str] = None,
    # Factores restantes
    telefono_verificado: bool,
    num_fotos: int,
    dias_vigencia: int,  # días desde fecha_renovacion hasta hoy
    reportes_activos: int,  # COUNT(*) WHERE estado IN ('PENDIENTE','CONFIRMADO')
) -> dict:
    """
    Firma canónica Sprint1 (dónde se llama ver abajo).

    Returns:
      {"indice": int 0-100,
       "desglose": {completitud, telefono, fotos, vigencia, reportes},
       "nivel": str, "advertencia": str}
    """
    w_completitud = getattr(settings, "TRUST_WEIGHT_COMPLETITUD", 40)
    desglose = {
        "completitud": _puntos_completitud(
            canon_mensual=canon_mensual, deposito_requerido=deposito_requerido,
            tipo_inmueble=tipo_inmueble, reglas_convivencia=reglas_convivencia,
            direccion_referencial=direccion_referencial, servicios_ids=servicios_ids,
            peso=w_completitud),
        "telefono": getattr(settings, "TRUST_WEIGHT_TELEFONO", 20) if telefono_verificado else 0,
        "fotos": getattr(settings, "TRUST_WEIGHT_FOTOS", 15) if num_fotos >= 3 else 0,
        "vigencia": getattr(settings, "TRUST_WEIGHT_VIGENCIA", 15) if dias_vigencia <= 30 else 0,
        "reportes": getattr(settings, "TRUST_WEIGHT_REPORTES", 10) if reportes_activos == 0 else 0,
    }
    score = max(0, min(100, sum(desglose.values())))

    return {
        "indice": score,
        "desglose": desglose,
        "nivel": _nivel(score),
        "advertencia": DISCLAIMER,
    }

# Helper para calcular dias_vigencia desde timestamp
def dias_desde(fecha_renovacion: datetime, ahora: Optional[datetime] = None) -> int:
    if fecha_renovacion is None:
        return 999  # sin vigencia -> 0 pts
    ahora = ahora or datetime.now(timezone.utc)
    if fecha_renovacion.tzinfo is None:
        fecha_renovacion = fecha_renovacion.replace(tzinfo=timezone.utc)
    return (ahora - fecha_renovacion).days

# Llamado en: POST/GET publicaciones y PATCH renovar. Detalle ver docs/ARQUITECTURA.md.
