"""Emparejamiento de roomies por reglas + puntaje de compatibilidad 0-100.

Diseño:
- Filtro previo: solo ESTUDIANTE, cuenta activa y con preferencias
  registradas (`Preferencias.tiene_datos()`). El chequeo de "registradas"
  es en Python porque requiere normalizar enums legacy y tri-estados.
- Reglas por dimensión (cada sub-señal sin dato aporta None y se excluye
  del promedio; las dimensiones sin datos se excluyen y los pesos se
  renormalizan, de modo que "no respondió" nunca suma ni resta).
- Filtros duros bilaterales opcionales: `acepta_mascotas` /
  `acepta_invitados` en False excluyen al candidato conflictivo.
- Pesos: aseo (0.30) + sueño (0.25) = 0.55 >= 50% (puntos 1 y 4 del PDF);
  invitados 0.15, pagos 0.15, carácter 0.15.

Puro salvo `candidatos` (lee) y nunca lanza: error de BD -> [] con warning.
"""
from __future__ import annotations

import logging
from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    EstabilidadIngresos,
    EstiloCocina,
    FuenteIngresos,
    HorarioAseo,
    MomentoAseoSemana,
    Preferencias,
    TiempoLavarLoza,
    TipoHorarioSueno,
    Usuario,
)

logger = logging.getLogger("alojau.matching")

PESOS = {  # aseo + sueno = 0.55 (>= 50% exigido); resto dividido en 3
    "aseo": 0.30,
    "sueno": 0.25,
    "invitados": 0.15,
    "pagos": 0.15,
    "caracter": 0.15,
}

_LOZA = [TiempoLavarLoza.INMEDIATAMENTE, TiempoLavarLoza.A_LO_LARGO_DEL_DIA,
         TiempoLavarLoza.OTRO_DIA_CUANDO_SE_NECESITE]
_ESTAB = [EstabilidadIngresos.ESTABLE, EstabilidadIngresos.VARIABLE,
          EstabilidadIngresos.POCO_ESTABLE]
_TOLERANCIA_SUENO_MIN = 180  # 3h: dormir a las 22 vs 01 sigue siendo parecido


def _dist_circular_min(a: time | None, b: time | None) -> float | None:
    """Distancia en minutos entre dos horas (el reloj es circular)."""
    if a is None or b is None:
        return None
    ma, mb = a.hour * 60 + a.minute, b.hour * 60 + b.minute
    d = abs(ma - mb)
    return min(d, 1440 - d)


def _sim_ordinal(a, b, orden: list) -> float | None:
    """1.0 si iguales, baja linealmente con la distancia. None si falta dato."""
    if a not in orden or b not in orden:
        return None
    if len(orden) < 2:
        return None
    return 1 - abs(orden.index(a) - orden.index(b)) / (len(orden) - 1)


def _sim_igual(a, b, sin_dato) -> float | None:
    if a == sin_dato or b == sin_dato:
        return None
    return 1.0 if a == b else 0.0


def _sim_bool(a: bool | None, b: bool | None) -> float | None:
    """Tri-estado: None (no respondió) no puntúa; False explícito sí."""
    if a is None or b is None:
        return None
    return 1.0 if a == b else 0.0


def _sim_bool_parcial(a: bool | None, b: bool | None, castigo: float) -> float | None:
    """Iguales -> 1.0; distintos -> crédito parcial (no todo desacuerdo
    pesa igual: no tener mascotas no es tan grave como planear fiestas)."""
    if a is None or b is None:
        return None
    return 1.0 if a == b else castigo


def _sim_acepta(acepta: bool | None, conducta: bool | None) -> float | None:
    """Aceptación vs conducta del otro: tolerante suma, rechazo + conducta
    resta, sin dato no puntúa."""
    if acepta is None or conducta is None:
        return None
    if acepta:
        return 1.0
    return 1.0 if not conducta else 0.0


def _sim_sueno(a: time | None, b: time | None,
               tolerancia_min: int = _TOLERANCIA_SUENO_MIN) -> float | None:
    d = _dist_circular_min(a, b)
    return None if d is None else max(0.0, 1 - d / tolerancia_min)


def _promedio(vals: list) -> float | None:
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def _conducta_invitados(p: Preferencias) -> bool | None:
    """True si planea invitados o invita a su pareja; None si no respondió."""
    vals = [p.planea_invitados, p.tiene_pareja_invitar]
    if all(v is None for v in vals):
        return None
    return any(v is True for v in vals)


def _sim_caracter(a: Preferencias, b: Preferencias) -> float | None:
    """Penaliza rasgos negativos compartidos (dos impacientes chocan);
    suma por diversidad de positivos. Simétrica."""
    if not (a.rasgos_negativos or b.rasgos_negativos
            or a.rasgos_positivos or b.rasgos_positivos):
        return None
    neg_comunes = set(a.rasgos_negativos) & set(b.rasgos_negativos)
    base = 0.7 + 0.05 * len(set(a.rasgos_positivos) | set(b.rasgos_positivos))
    return max(0.0, min(1.0, base - 0.2 * len(neg_comunes)))


def conflictos_duros(a: Preferencias, b: Preferencias) -> list[str]:
    """Filtros duros bilaterales opcionales. Solo un False explícito
    excluye (None = no declaró, no filtra). Retorna códigos de motivo."""
    motivos = []
    if ((a.acepta_mascotas is False and b.tiene_mascotas is True)
            or (b.acepta_mascotas is False and a.tiene_mascotas is True)):
        motivos.append("mascotas")
    cond_a, cond_b = _conducta_invitados(a), _conducta_invitados(b)
    if ((a.acepta_invitados is False and cond_b is True)
            or (b.acepta_invitados is False and cond_a is True)):
        motivos.append("invitados")
    return motivos


def compatibilidad(a: Preferencias, b: Preferencias) -> dict:
    """Puntaje 0-100 + detalle por dimensión (None = sin datos cruzados).

    Simétrica: compatibilidad(a, b) == compatibilidad(b, a).
    """
    dims = {
        "aseo": _promedio([
            _sim_igual(a.momento_aseo_semana, b.momento_aseo_semana,
                       MomentoAseoSemana.SIN_DATO),
            _sim_igual(a.horario_aseo, b.horario_aseo, HorarioAseo.SIN_DATO),
            _sim_igual(a.estilo_cocina, b.estilo_cocina, EstiloCocina.SIN_DATO),
            _sim_ordinal(a.tiempo_lavar_loza, b.tiempo_lavar_loza, _LOZA),
        ]),
        "sueno": _promedio([
            _sim_sueno(a.hora_dormir, b.hora_dormir),
            _sim_sueno(a.hora_despertar, b.hora_despertar),
            _sim_igual(a.tipo_horario_sueno, b.tipo_horario_sueno,
                       TipoHorarioSueno.SIN_DATO),
        ]),
        "invitados": _promedio([
            _sim_bool_parcial(a.planea_invitados, b.planea_invitados, 0.3),
            _sim_bool_parcial(a.tiene_pareja_invitar, b.tiene_pareja_invitar, 0.5),
            _sim_bool_parcial(a.tiene_mascotas, b.tiene_mascotas, 0.6),
            _sim_acepta(a.acepta_invitados, _conducta_invitados(b)),
            _sim_acepta(b.acepta_invitados, _conducta_invitados(a)),
            _sim_acepta(a.acepta_mascotas, b.tiene_mascotas),
            _sim_acepta(b.acepta_mascotas, a.tiene_mascotas),
        ]),
        "pagos": _promedio([
            _sim_bool(a.puntual_pagos, b.puntual_pagos),
            _sim_ordinal(a.estabilidad_ingresos, b.estabilidad_ingresos, _ESTAB),
            _sim_igual(a.fuente_ingresos, b.fuente_ingresos,
                       FuenteIngresos.SIN_DATO),
        ]),
        "caracter": _sim_caracter(a, b),
    }
    activos = {k: v for k, v in dims.items() if v is not None}
    if not activos:
        return {"score": None, "detalle": dims}
    total_peso = sum(PESOS[k] for k in activos)
    score = sum(PESOS[k] * v for k, v in activos.items()) / total_peso
    return {"score": round(score * 100), "detalle": dims}


async def candidatos(db: AsyncSession, yo: Usuario, limite: int = 20) -> list[dict]:
    """Ranking de roomies compatibles: filtra ESTUDIANTE activos con
    preferencias registradas (excluye al propio usuario y conflictos
    duros), ordena por score desc y corta en `limite`."""
    try:
        stmt = select(Usuario).where(
            Usuario.rol == "ESTUDIANTE",
            Usuario.eliminado_en.is_(None),
            Usuario.id != yo.id,
        )
        pool = (await db.execute(stmt)).scalars().all()
        mias = yo.preferencias_obj
        ranking = []
        for u in pool:
            suyas = u.preferencias_obj
            if not suyas.tiene_datos():
                continue
            if conflictos_duros(mias, suyas):
                continue
            res = compatibilidad(mias, suyas)
            if res["score"] is None:
                continue
            ranking.append({"usuario": u, "score": res["score"],
                            "detalle": res["detalle"]})
        ranking.sort(key=lambda r: r["score"], reverse=True)
        return ranking[:max(0, limite)]
    except Exception as e:
        logger.warning("[matching] candidatos falló, retorno vacío: %s", type(e).__name__)
        return []
