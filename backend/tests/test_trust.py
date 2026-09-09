from app.services.trust import calcular_indice
def test_full_score():
    r=calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="No mascotas, visitas", direccion_referencial="Calle 5 # 4-10", servicios_ids=[1,2], telefono_verificado=True, num_fotos=3, dias_vigencia=5, reportes_activos=0)
    assert r["indice"]==90 or r["indice"]>=80  # 40+20+15+15+10 but completitud may vary
    assert "desglose" in r
    assert r["desglose"]["telefono"]==20
def test_no_fotos():
    r=calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=False, num_fotos=1, dias_vigencia=40, reportes_activos=1)
    assert r["desglose"]["fotos"]==0
    assert r["desglose"]["vigencia"]==0
    assert r["desglose"]["reportes"]==0
def test_bug_fix_reportes():
    # Factor5 debe ser PENDIENTE/CONFIRMADO, no ACTIVO
    r=calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas ok", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=True, num_fotos=3, dias_vigencia=5, reportes_activos=1)
    assert r["desglose"]["reportes"]==0
    r2=calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas ok", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=True, num_fotos=3, dias_vigencia=5, reportes_activos=0)
    assert r2["desglose"]["reportes"]==10

def test_trust_telefono_score():
    r_no_tel = calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas ok", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=False, num_fotos=3, dias_vigencia=5, reportes_activos=0)
    assert r_no_tel["desglose"]["telefono"] == 0

    r_tel = calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas ok", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=True, num_fotos=3, dias_vigencia=5, reportes_activos=0)
    assert r_tel["desglose"]["telefono"] == 20

def test_trust_configurable_weights(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "TRUST_WEIGHT_TELEFONO", 35)
    monkeypatch.setattr(settings, "TRUST_WEIGHT_FOTOS", 25)

    r = calcular_indice(canon_mensual=500000, deposito_requerido=0, tipo_inmueble="APARTAESTUDIO", reglas_convivencia="Reglas ok", direccion_referencial="Dir", servicios_ids=[1], telefono_verificado=True, num_fotos=3, dias_vigencia=5, reportes_activos=0)
    assert r["desglose"]["telefono"] == 35
    assert r["desglose"]["fotos"] == 25

