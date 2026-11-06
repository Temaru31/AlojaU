"""Matching por bandas: 12 candidatos por serie (unitario puro, sin BD/HTTP).

- Alta: score >= 80 · Media: 50 <= score < 80 · Baja: score < 50.
Cada test verifica la banda vía `compatibilidad` y que `candidatos`
devuelve la serie completa ordenada por score descendente.
"""
import asyncio
from datetime import time

from app.models import Preferencias, Usuario
from app.services.matching import candidatos, compatibilidad

BASE = dict(
    momento_aseo_semana="entre_semana", horario_aseo="manana_6am_11am",
    estilo_cocina="organizado", tiempo_lavar_loza="inmediatamente",
    fuente_ingresos="trabajo_fijo", estabilidad_ingresos="estable",
    puntual_pagos=True, rasgos_positivos=["respetuoso", "paciente"],
    rasgos_negativos=["impaciente"], hora_dormir=time(23, 0),
    hora_despertar=time(6, 30), tipo_horario_sueno="estable",
    tiene_pareja_invitar=False, tiene_mascotas=False, planea_invitados=False,
    acepta_mascotas=True, acepta_invitados=True,
)
ASEO0 = dict(momento_aseo_semana="fin_de_semana", horario_aseo="noche_7pm_9pm",
             estilo_cocina="desorganizado",
             tiempo_lavar_loza="otro_dia_cuando_se_necesite")
SUENO_OPUESTO = dict(hora_dormir=time(11, 0), hora_despertar=time(18, 0),
                     tipo_horario_sueno="variable")

YO = Preferencias(**BASE)

SERIE_ALTA = [
    dict(horario_aseo="tarde_12pm_6pm"),
    dict(hora_dormir=time(23, 30)),
    dict(hora_despertar=time(7, 0)),
    dict(tipo_horario_sueno="variable"),
    dict(estabilidad_ingresos="variable"),
    dict(fuente_ingresos="respaldo_familiar"),
    dict(puntual_pagos=False),
    dict(rasgos_positivos=["respetuoso"]),
    dict(rasgos_negativos=[]),
    dict(rasgos_negativos=["impaciente", "malhumorado"]),
    dict(tiene_mascotas=True),
    dict(planea_invitados=True),
]

SERIE_MEDIA = [
    dict(**ASEO0),
    dict(**ASEO0, tipo_horario_sueno="variable"),
    dict(**SUENO_OPUESTO),
    dict(**SUENO_OPUESTO, horario_aseo="tarde_12pm_6pm",
         estilo_cocina="desorganizado"),
    dict(puntual_pagos=False, estabilidad_ingresos="poco_estable",
         fuente_ingresos="respaldo_familiar"),
    dict(**ASEO0, puntual_pagos=False, estabilidad_ingresos="poco_estable"),
    dict(horario_aseo="noche_7pm_9pm", estabilidad_ingresos="poco_estable",
         puntual_pagos=False),
    dict(hora_dormir=time(3, 0), hora_despertar=time(11, 0),
         tipo_horario_sueno="variable"),
    dict(momento_aseo_semana="fin_de_semana", horario_aseo="noche_7pm_9pm",
         estabilidad_ingresos="variable"),
    dict(fuente_ingresos="respaldo_familiar",
         estabilidad_ingresos="poco_estable", puntual_pagos=False,
         planea_invitados=True),
    dict(puntual_pagos=False, estabilidad_ingresos="poco_estable",
         fuente_ingresos="respaldo_familiar", horario_aseo="tarde_12pm_6pm"),
    dict(**SUENO_OPUESTO, puntual_pagos=False,
         estabilidad_ingresos="poco_estable"),
]

SERIE_BAJA = [
    dict(**ASEO0, **SUENO_OPUESTO),
    dict(**ASEO0, **SUENO_OPUESTO, puntual_pagos=False,
         estabilidad_ingresos="poco_estable",
         fuente_ingresos="respaldo_familiar"),
    dict(**ASEO0, **SUENO_OPUESTO, planea_invitados=True,
         tiene_pareja_invitar=True, tiene_mascotas=True),
    dict(**ASEO0, **SUENO_OPUESTO, rasgos_positivos=[],
         rasgos_negativos=["impaciente", "malhumorado", "terco_orgulloso",
                           "bajo_manejo_frustracion"]),
    dict(**ASEO0, hora_dormir=time(12, 0), hora_despertar=time(19, 0),
         tipo_horario_sueno="variable", puntual_pagos=False,
         estabilidad_ingresos="poco_estable"),
    dict(**ASEO0, hora_dormir=time(12, 0), hora_despertar=time(19, 0),
         tipo_horario_sueno="variable", puntual_pagos=False,
         estabilidad_ingresos="poco_estable", planea_invitados=True,
         tiene_pareja_invitar=True),
    dict(**ASEO0, hora_dormir=time(10, 0), hora_despertar=time(17, 0),
         tipo_horario_sueno="variable"),
    dict(**ASEO0, hora_dormir=time(13, 0), hora_despertar=time(20, 0),
         tipo_horario_sueno="variable"),
    dict(**ASEO0, hora_dormir=time(2, 0), hora_despertar=time(9, 0),
         tipo_horario_sueno="variable"),
    dict(**ASEO0, **SUENO_OPUESTO, puntual_pagos=False),
    dict(**ASEO0, **SUENO_OPUESTO, rasgos_positivos=[],
         rasgos_negativos=[]),
    dict(**ASEO0, **SUENO_OPUESTO, planea_invitados=True),
]


def _usuarios(overrides: list[dict]) -> list[Usuario]:
    usuarios = []
    for i, ov in enumerate(overrides, start=2):
        u = Usuario(nombre_completo=f"Roomie {i}", email=f"roomie{i}@t.com",
                    password_hash="x", rol="ESTUDIANTE")
        u.id = i
        u.preferencias = Preferencias(**{**BASE, **ov}).to_dict()
        usuarios.append(u)
    return usuarios


class _FakeDB:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, stmt):
        class _S:
            def __init__(self, rows):
                self.rows = rows

            def all(self):
                return self.rows

        class _R:
            def __init__(self, rows):
                self.rows = rows

            def scalars(self):
                return _S(self.rows)

        return _R(self.rows)


def _yo() -> Usuario:
    yo = Usuario(nombre_completo="Yo", email="yo@t.com",
                 password_hash="x", rol="ESTUDIANTE")
    yo.id = 1
    yo.preferencias = YO.to_dict()
    return yo


def _verificar_banda(overrides: list[dict], lo: int, hi: int | None) -> list[dict]:
    assert len(overrides) == 12
    pool = _usuarios(overrides)
    for u in pool:
        score = compatibilidad(YO, u.preferencias_obj)["score"]
        assert score is not None
        assert score >= lo, (u.email, score)
        if hi is not None:
            assert score < hi, (u.email, score)
    rank = asyncio.run(candidatos(_FakeDB(pool), _yo(), limite=20))
    assert len(rank) == 12
    scores = [r["score"] for r in rank]
    assert scores == sorted(scores, reverse=True)
    assert all((s >= lo and (hi is None or s < hi)) for s in scores)
    return rank


def test_serie_alta():
    _verificar_banda(SERIE_ALTA, lo=80, hi=None)


def test_serie_media():
    _verificar_banda(SERIE_MEDIA, lo=50, hi=80)


def test_serie_baja():
    _verificar_banda(SERIE_BAJA, lo=0, hi=50)
