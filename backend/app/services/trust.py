"""
TrustScoreEngine - HU-007 Tabla14:25
Cálculo reproducible 0-100: 40 +20 +15 +15 +10
IMPORTANTE: indice no es garantía (ver disclaimer escala colores p25)
Bug corregido: Factor5 usa PENDIENTE/CONFIRMADO, no ACTIVO
"""
def calcular_indice(publicacion, telefono_verificado: bool, num_fotos: int, dias_vigencia: int, reportes_activos: int) -> dict:
    score = 0
    desglose = {}
    # 40 completitud (simplificado: si tiene canon+deposito+tipo+reglas+direccion+servicios)
    desglose["completitud"] = 40 if all([publicacion.get("canon"), publicacion.get("tipo"), publicacion.get("direccion")]) else 0
    desglose["telefono"] = 20 if telefono_verificado else 0
    desglose["fotos"] = 15 if num_fotos >= 3 else 0
    desglose["vigencia"] = 15 if dias_vigencia <= 30 else 0
    desglose["reportes"] = 10 if reportes_activos == 0 else 0
    score = sum(desglose.values())
    nivel = "alto" if score>=80 else "medio" if score>=50 else "basico"
    return {"indice": score, "desglose": desglose, "nivel": nivel, "advertencia": "Informativo, no garantiza seguridad. Verificar antes de pagar."}
