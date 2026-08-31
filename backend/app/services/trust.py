"""
services/trust.py - TrustScoreEngine HU-007 (Tabla16 p20)
Cálculo reproducible 0-100: 40+20+15+15+10 (Sprint1)

IMPORTANTE (bug fix p18/20):
  Factor 5 "Ausencia de reportes" debe consultar reportes con estado IN ('PENDIENTE','CONFIRMADO'),
  NO 'ACTIVO' (estado inexistente en diccionario Tabla24). El código legacy usaba ACTIVO y nunca descontaba.

Escala visual: 0-49 básico (naranja), 50-79 medio (amarillo), 80-100 alto (verde) + disclaimer obligatorio.
"""

from datetime import datetime, timezone
from typing import Optional

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

    # ---- Factor1: Completitud 40 (desglose fino Tabla16) ----
    # Si Sprint1 simplifica, al menos exigir canon>0, tipo, dirección, reglas y servicios.
    # Para DoD Sprint1 adoptamos criterio estricto:
    c_canon = 10 if canon_mensual is not None and canon_mensual > 0 else 0
    c_deposito = 5 if deposito_requerido is not None else 0  # 0 explícito cuenta
    c_tipo = 5 if tipo_inmueble in ("HABITACION_FAMILIAR","HABITACION_INDEPENDIENTE","APARTAESTUDIO","COMPARTIDO") else 0
    c_reglas = 5 if reglas_convivencia and len(reglas_convivencia.strip()) >= 10 else 0
    c_direccion = 5 if direccion_referencial and len(direccion_referencial.strip()) >= 10 else 0
    c_servicios = 10 if servicios_ids and len(servicios_ids) >= 1 else 0
    # Suma 40 si todo ok, 0 si incompleto? Sprint1 puntúa proporcional para feedback:
    # Para cumplir spec "todo o nada" del PDF, si HU-005 exige campos obligatorios, aquí 40 si suma==40 else proporcional.
    # Decisión Sprint1: proporcional (más útil para índice progresivo) pero documentado.
    completitud = c_canon + c_deposito + c_tipo + c_reglas + c_direccion + c_servicios
    desglose["completitud"] = completitud  # 0-40

    # ---- Factor2: Teléfono validado 20 ----
    desglose["telefono"] = 20 if telefono_verificado else 0

    # ---- Factor3: Fotos >=3  15 ----
    desglose["fotos"] = 15 if num_fotos >= 3 else 0

    # ---- Factor4: Vigencia confirmada <=30d  15 ----
    # dias_vigencia = (hoy - fecha_renovacion).days
    desglose["vigencia"] = 15 if dias_vigencia <= 30 else 0

    # ---- Factor5: Ausencia reportes 10 (BUG FIX) ----
    # Correcto: reportes_activos == count WHERE estado IN ('PENDIENTE','CONFIRMADO')
    # Incorrecto legacy: WHERE estado='ACTIVO' (no existe, siempre 0 => 10 pts regalados)
    desglose["reportes"] = 10 if reportes_activos == 0 else 0

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

# DÓNDE SE LLAMA (Sprint1):
# 1. POST /api/publicaciones (routers/publicaciones.py::crear_publicacion) -> calcula índice inicial y lo persiste en publicaciones.indice_confianza
# 2. GET /api/publicaciones y GET /api/publicaciones/{id} -> si hay DB, recalcula o lee indice_confianza + desglose para PublicacionOut
# 3. PATCH /api/publicaciones/{id}/renovar (HU-006 Sprint2) -> recalcula (vigencia vuelve a 15)
# 4. Job nocturno expiración (Sprint2) -> no recalcula, solo cambia estado a EXPIRADO
# Tests: tests/test_trust.py debe validar bug fix reportes PENDIENTE/CONFIRMADO
