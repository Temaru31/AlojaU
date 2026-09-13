"""Calcula índice confianza 0-100 (40+20+15+15+10) con desglose y nivel.
Uso: routers/publicaciones.py::crear/list/detalle. Ej: calcular_indice(..., telefono_verificado=True, num_fotos=4, dias_vigencia=5, reportes_activos=0) -> {"indice": 95, ...}."""

from datetime import datetime, timezone
from typing import Optional
from app.core.config import settings

DISCLAIMER = "Informativo, no garantiza seguridad. Verificar antes de pagar."

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
      {"indice": int 0-100, "desglose": {completitud, telefono, fotos, vigencia, reportes}, "nivel": str, "advertencia": str}
    """
    desglose: dict[str, int] = {}

    w_completitud = getattr(settings, "TRUST_WEIGHT_COMPLETITUD", 40)
    w_telefono = getattr(settings, "TRUST_WEIGHT_TELEFONO", 20)
    w_fotos = getattr(settings, "TRUST_WEIGHT_FOTOS", 15)
    w_vigencia = getattr(settings, "TRUST_WEIGHT_VIGENCIA", 15)
    w_reportes = getattr(settings, "TRUST_WEIGHT_REPORTES", 10)

    # ---- Factor1: Completitud 40 (desglose fino Tabla16) ----
    c_canon = 10 if canon_mensual is not None and canon_mensual > 0 else 0
    c_deposito = 5 if deposito_requerido is not None else 0  # 0 explícito cuenta
    c_tipo = 5 if tipo_inmueble in ("HABITACION_FAMILIAR","HABITACION_INDEPENDIENTE","APARTAESTUDIO","COMPARTIDO") else 0
    c_reglas = 5 if reglas_convivencia and len(reglas_convivencia.strip()) >= 10 else 0
    c_direccion = 5 if direccion_referencial and len(direccion_referencial.strip()) >= 10 else 0
    c_servicios = 10 if servicios_ids and len(servicios_ids) >= 1 else 0
    raw_completitud = c_canon + c_deposito + c_tipo + c_reglas + c_direccion + c_servicios
    desglose["completitud"] = int(round((raw_completitud / 40.0) * w_completitud)) if w_completitud != 40 else raw_completitud

    # ---- Factor2: Teléfono validado ----
    desglose["telefono"] = w_telefono if telefono_verificado else 0

    # ---- Factor3: Fotos >=3 ----
    desglose["fotos"] = w_fotos if num_fotos >= 3 else 0

    # ---- Factor4: Vigencia confirmada <=30d ----
    desglose["vigencia"] = w_vigencia if dias_vigencia <= 30 else 0

    # ---- Factor5: Ausencia reportes ----
    desglose["reportes"] = w_reportes if reportes_activos == 0 else 0


    score = sum(desglose.values())  # 0-100
    score = max(0, min(100, score))

    if score >= 80:
        nivel = "alto"
    elif score >= 50:
        nivel = "medio"
    else:
        nivel = "basico"

    return {
        "indice": score,
        "desglose": desglose,
        "nivel": nivel,
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
