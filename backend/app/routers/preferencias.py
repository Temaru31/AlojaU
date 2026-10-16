"""Catálogo público de enums de Preferencias (Opciones de personalización.pdf).

- GET /api/preferencias/enums (público, sin BD): lista los 9 enums con sus
  opciones [{valor, etiqueta}], la clave JSONB (`roomie.*`) y el punto del PDF.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.models import (
    CLAVES_PREFERENCIAS,
    MomentoAseoSemana,
    HorarioAseo,
    EstiloCocina,
    TiempoLavarLoza,
    FuenteIngresos,
    EstabilidadIngresos,
    RasgoPositivo,
    RasgoNegativo,
    TipoHorarioSueno,
)

router = APIRouter(prefix="/api/preferencias", tags=["preferencias"])

_ETIQUETAS = {
    "sin_dato": "Sin dato",
    "entre_semana": "Entre semana",
    "fin_de_semana": "Fin de semana",
    "manana_6am_11am": "Mañana (6AM-11AM)",
    "tarde_12pm_6pm": "Tarde (12PM-6PM)",
    "noche_7pm_9pm": "Noche (7PM-9PM)",
    "organizado": "Organizad@",
    "desorganizado": "Desorganizad@",
    "inmediatamente": "Inmediatamente",
    "a_lo_largo_del_dia": "A lo largo del día",
    "otro_dia_cuando_se_necesite": "Otro día cuando lo vuelvas a necesitar",
    "trabajo_fijo": "Trabajo fijo",
    "trabajo_independiente_emprendimiento": "Trabajo Independiente/Emprendimiento",
    "respaldo_familiar": "Respaldo familiar",
    "estable": "Estable",
    "variable": "Variable",
    "poco_estable": "Poco estable",
    "respetuoso": "Respetuoso",
    "tranquilo": "Tranquilo",
    "paciente": "Paciente",
    "buena_vibra": "Buena vibra",
    "impaciente": "Impaciente (Al menos un poco)",
    "bajo_manejo_frustracion": "Bajo manejo de frustración",
    "malhumorado": "Malhumorad@ (Al menos algunas veces)",
    "terco_orgulloso": "Terc@/Orgullos@",
}

_ETIQUETAS_SUENO = {
    "sin_dato": "Sin dato",
    "estable": "Estable (Constante con algunas excepciones)",
    "variable": "Variable (Constantemente cambiante)",
}

# (Enum, clave del atributo en Preferencias, punto del PDF, descripción, es_lista)
_CATALOGO = (
    (MomentoAseoSemana, "momento_aseo_semana", 1,
     "En qué momento de la semana prefieres hacer aseo", False),
    (HorarioAseo, "horario_aseo", 1,
     "Generalmente en qué horario haces el aseo", False),
    (EstiloCocina, "estilo_cocina", 1,
     "Cómo eres en la cocina", False),
    (TiempoLavarLoza, "tiempo_lavar_loza", 1,
     "Cuánto tardas en lavar la loza", False),
    (FuenteIngresos, "fuente_ingresos", 2,
     "Cuál es tu fuente de ingresos", False),
    (EstabilidadIngresos, "estabilidad_ingresos", 2,
     "Qué tan estable es tu fuente de ingresos", False),
    (RasgoPositivo, "rasgos_positivos", 3,
     "Características positivas (lista)", True),
    (RasgoNegativo, "rasgos_negativos", 3,
     "Características negativas (lista, mínimo dos)", True),
    (TipoHorarioSueno, "tipo_horario_sueno", 4,
     "Cómo describirías tu horario de sueño", False),
)


class OpcionEnumOut(BaseModel):
    valor: str
    etiqueta: str


class EnumPreferenciasOut(BaseModel):
    nombre: str
    clave_json: str
    punto: int
    descripcion: str
    es_lista: bool = False
    opciones: list[OpcionEnumOut]


class CatalogoEnumsOut(BaseModel):
    enums: list[EnumPreferenciasOut]


def _opciones(enum_cls) -> list[dict]:
    etiquetas = _ETIQUETAS_SUENO if enum_cls is TipoHorarioSueno else _ETIQUETAS
    return [
        {"valor": m.value, "etiqueta": etiquetas.get(m.value, m.value)}
        for m in enum_cls
    ]


@router.get("/enums", response_model=CatalogoEnumsOut,
            summary="Catálogo de enums de preferencias (opciones del PDF)")
async def listar_enums():
    """Retorna los 9 enums con sus opciones (valor + etiqueta en español)."""
    return {
        "enums": [
            {
                "nombre": enum_cls.__name__,
                "clave_json": CLAVES_PREFERENCIAS[atributo],
                "punto": punto,
                "descripcion": descripcion,
                "es_lista": es_lista,
                "opciones": _opciones(enum_cls),
            }
            for enum_cls, atributo, punto, descripcion, es_lista in _CATALOGO
        ]
    }
