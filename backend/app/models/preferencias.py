"""Preferencias de convivencia (roomies): enums del cuestionario y su normalización."""
from dataclasses import dataclass, field
from datetime import time
import enum


# Preferencias de convivencia / roomie (Opciones de personalización.pdf).
# Diseño: NO son tablas nuevas. Son `Enum` de Python + clase `Preferencias`
# (dataclass embebida) que se persiste serializada en la columna existente
# `usuarios.preferencias` (JSONB, claves `roomie.*`). Así no se requiere
# migración ni se rompe el contrato actual del PATCH /api/auth/perfil
# (validar_preferencias). `Usuario.preferencias_obj` expone la instancia.
# Todos los enums incluyen SIN_DATO ("sin_dato") como valor por defecto.
class MomentoAseoSemana(str, enum.Enum):
    """Punto 1: momento de la semana para el aseo."""
    SIN_DATO = "sin_dato"
    ENTRE_SEMANA = "entre_semana"
    FIN_DE_SEMANA = "fin_de_semana"


class HorarioAseo(str, enum.Enum):
    """Punto 1: horario habitual del aseo."""
    SIN_DATO = "sin_dato"
    MANANA_6AM_11AM = "manana_6am_11am"
    TARDE_12PM_6PM = "tarde_12pm_6pm"
    NOCHE_7PM_9PM = "noche_7pm_9pm"


class EstiloCocina(str, enum.Enum):
    """Punto 1: cómo eres en la cocina (el @ solo vive en etiquetas UI)."""
    SIN_DATO = "sin_dato"
    ORGANIZADO = "organizado"
    DESORGANIZADO = "desorganizado"


class TiempoLavarLoza(str, enum.Enum):
    """Punto 1: cuánto tardas en lavar la loza."""
    SIN_DATO = "sin_dato"
    INMEDIATAMENTE = "inmediatamente"
    A_LO_LARGO_DEL_DIA = "a_lo_largo_del_dia"
    OTRO_DIA_CUANDO_SE_NECESITE = "otro_dia_cuando_se_necesite"


class FuenteIngresos(str, enum.Enum):
    """Punto 2: fuente de ingresos."""
    SIN_DATO = "sin_dato"
    TRABAJO_FIJO = "trabajo_fijo"
    TRABAJO_INDEPENDIENTE_EMPRENDIMIENTO = "trabajo_independiente_emprendimiento"
    RESPALDO_FAMILIAR = "respaldo_familiar"


class EstabilidadIngresos(str, enum.Enum):
    """Punto 2: estabilidad de la fuente de ingresos."""
    SIN_DATO = "sin_dato"
    ESTABLE = "estable"
    VARIABLE = "variable"
    POCO_ESTABLE = "poco_estable"


class RasgoPositivo(str, enum.Enum):
    """Punto 3: características positivas (lista, mínimo dos defectos aparte)."""
    SIN_DATO = "sin_dato"
    RESPETUOSO = "respetuoso"
    TRANQUILO = "tranquilo"
    PACIENTE = "paciente"
    BUENA_VIBRA = "buena_vibra"


class RasgoNegativo(str, enum.Enum):
    """Punto 3: características negativas (mínimo dos necesarias)."""
    SIN_DATO = "sin_dato"
    IMPACIENTE = "impaciente"
    BAJO_MANEJO_FRUSTRACION = "bajo_manejo_frustracion"
    MALHUMORADO = "malhumorado"
    TERCO_ORGULLOSO = "terco_orgulloso"


class TipoHorarioSueno(str, enum.Enum):
    """Punto 4: cómo describirías tu horario de sueño."""
    SIN_DATO = "sin_dato"
    ESTABLE = "estable"
    VARIABLE = "variable"


# Valores legacy con "@" (v1 del PDF): se aceptan al LEER (compatibilidad
# con datos ya guardados), pero ya no se emiten (ver from_dict/to_dict).
_ALIAS_ENUM_LEGACY = {
    "organizad@": "organizado",
    "desorganizad@": "desorganizado",
    "malhumorad@": "malhumorado",
    "terc@_orgullos@": "terco_orgulloso",
}


def _coerce_enum(enum_cls, valor, por_defecto):
    """Convierte str/Enum a miembro del enum; desconocido -> por_defecto."""
    if isinstance(valor, enum_cls):
        return valor
    if valor is None:
        return por_defecto
    try:
        texto = str(valor).strip().lower()
        texto = _ALIAS_ENUM_LEGACY.get(texto, texto)
        return enum_cls(texto)
    except (ValueError, AttributeError):
        return por_defecto


def _coerce_lista_enum(enum_cls, valor) -> list:
    """Convierte lista de str/Enum a lista de miembros (sin duplicados,
    filtrando SIN_DATO; desconocidos se ignoran)."""
    if not valor:
        return []
    if isinstance(valor, (str, bytes)):
        valor = [valor]
    salida, vistos = [], set()
    for item in valor:
        m = _coerce_enum(enum_cls, item, None)
        if m is None or m == enum_cls.SIN_DATO or m in vistos:
            continue
        vistos.add(m)
        salida.append(m)
    return salida


def _coerce_hora(valor) -> time | None:
    """Acepta time | 'HH:MM' | 'HH:MM:SS' | None."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, time):
        return valor
    try:
        partes = str(valor).strip().split(":")
        h, m = int(partes[0]), int(partes[1]) if len(partes) > 1 else 0
        s = int(partes[2]) if len(partes) > 2 else 0
        return time(hour=h, minute=m, second=s)
    except (ValueError, IndexError, TypeError):
        return None


def _hora_a_str(valor: time | None) -> str | None:
    return valor.strftime("%H:%M") if isinstance(valor, time) else None


def _coerce_bool3(valor) -> bool | None:
    """Tri-estado Sí/No/sin responder: True/False estrictos, resto -> None.

    Distingue "No" (False) de "no respondió" (None) para no distorsionar
    el matching (un NULL nunca suma ni resta, la dimensión se renormaliza).
    """
    if valor is True:
        return True
    if valor is False:
        return False
    return None


# Claves JSONB (namespace roomie.*) compatibles con validar_preferencias.
CLAVES_PREFERENCIAS = {
    "momento_aseo_semana": "roomie.aseo_momento_semana",
    "horario_aseo": "roomie.aseo_horario",
    "estilo_cocina": "roomie.cocina_estilo",
    "tiempo_lavar_loza": "roomie.loza_tiempo",
    "fuente_ingresos": "roomie.ingresos_fuente",
    "estabilidad_ingresos": "roomie.ingresos_estabilidad",
    "puntual_pagos": "roomie.pagos_puntual",
    "rasgos_positivos": "roomie.rasgos_positivos",
    "rasgos_negativos": "roomie.rasgos_negativos",
    "hora_dormir": "roomie.sueno_hora_dormir",
    "hora_despertar": "roomie.sueno_hora_despertar",
    "tipo_horario_sueno": "roomie.sueno_tipo",
    "tiene_pareja_invitar": "roomie.invitados_pareja",
    "tiene_mascotas": "roomie.mascotas",
    "planea_invitados": "roomie.invitados_plan",
    "acepta_mascotas": "roomie.acepta_mascotas",
    "acepta_invitados": "roomie.acepta_invitados",
}


@dataclass
class Preferencias:
    """Preferencias de convivencia del usuario (puntos 1-5 del PDF).

    Constructor recibe los 17 atributos (todos con defecto: enums en
    SIN_DATO, tri-estados en None = no respondió, listas vacías, horas None).
    Se persiste vía `to_dict()`/`from_dict()` en `Usuario.preferencias`.
    """

    # Punto 1: higiene y orden.
    momento_aseo_semana: MomentoAseoSemana = MomentoAseoSemana.SIN_DATO
    horario_aseo: HorarioAseo = HorarioAseo.SIN_DATO
    estilo_cocina: EstiloCocina = EstiloCocina.SIN_DATO
    tiempo_lavar_loza: TiempoLavarLoza = TiempoLavarLoza.SIN_DATO
    # Punto 2: solvencia (la puntualidad es tri-estado, no enum).
    fuente_ingresos: FuenteIngresos = FuenteIngresos.SIN_DATO
    estabilidad_ingresos: EstabilidadIngresos = EstabilidadIngresos.SIN_DATO
    puntual_pagos: bool | None = None
    # Punto 3: rasgos (listas).
    rasgos_positivos: list = field(default_factory=list)
    rasgos_negativos: list = field(default_factory=list)
    # Punto 4: sueño.
    hora_dormir: time | None = None
    hora_despertar: time | None = None
    tipo_horario_sueno: TipoHorarioSueno = TipoHorarioSueno.SIN_DATO
    # Punto 5: invitados y mascotas (tri-estado) + aceptación (filtros duros).
    tiene_pareja_invitar: bool | None = None
    tiene_mascotas: bool | None = None
    planea_invitados: bool | None = None
    acepta_mascotas: bool | None = None
    acepta_invitados: bool | None = None

    def __post_init__(self):
        self.momento_aseo_semana = _coerce_enum(
            MomentoAseoSemana, self.momento_aseo_semana, MomentoAseoSemana.SIN_DATO)
        self.horario_aseo = _coerce_enum(HorarioAseo, self.horario_aseo, HorarioAseo.SIN_DATO)
        self.estilo_cocina = _coerce_enum(EstiloCocina, self.estilo_cocina, EstiloCocina.SIN_DATO)
        self.tiempo_lavar_loza = _coerce_enum(
            TiempoLavarLoza, self.tiempo_lavar_loza, TiempoLavarLoza.SIN_DATO)
        self.fuente_ingresos = _coerce_enum(
            FuenteIngresos, self.fuente_ingresos, FuenteIngresos.SIN_DATO)
        self.estabilidad_ingresos = _coerce_enum(
            EstabilidadIngresos, self.estabilidad_ingresos, EstabilidadIngresos.SIN_DATO)
        self.tipo_horario_sueno = _coerce_enum(
            TipoHorarioSueno, self.tipo_horario_sueno, TipoHorarioSueno.SIN_DATO)
        self.rasgos_positivos = _coerce_lista_enum(RasgoPositivo, self.rasgos_positivos)
        self.rasgos_negativos = _coerce_lista_enum(RasgoNegativo, self.rasgos_negativos)
        self.hora_dormir = _coerce_hora(self.hora_dormir)
        self.hora_despertar = _coerce_hora(self.hora_despertar)
        self.puntual_pagos = _coerce_bool3(self.puntual_pagos)
        self.tiene_pareja_invitar = _coerce_bool3(self.tiene_pareja_invitar)
        self.tiene_mascotas = _coerce_bool3(self.tiene_mascotas)
        self.planea_invitados = _coerce_bool3(self.planea_invitados)
        self.acepta_mascotas = _coerce_bool3(self.acepta_mascotas)
        self.acepta_invitados = _coerce_bool3(self.acepta_invitados)

    def to_dict(self, solo_informados: bool = False) -> dict:
        """Serializa a JSONB (claves roomie.*). None = no respondió y se
        persiste como null. Con solo_informados=True omite SIN_DATO/None/
        vacíos/False (útil para PATCH parcial)."""
        d = {
            CLAVES_PREFERENCIAS["momento_aseo_semana"]: self.momento_aseo_semana.value,
            CLAVES_PREFERENCIAS["horario_aseo"]: self.horario_aseo.value,
            CLAVES_PREFERENCIAS["estilo_cocina"]: self.estilo_cocina.value,
            CLAVES_PREFERENCIAS["tiempo_lavar_loza"]: self.tiempo_lavar_loza.value,
            CLAVES_PREFERENCIAS["fuente_ingresos"]: self.fuente_ingresos.value,
            CLAVES_PREFERENCIAS["estabilidad_ingresos"]: self.estabilidad_ingresos.value,
            CLAVES_PREFERENCIAS["puntual_pagos"]: self.puntual_pagos,
            CLAVES_PREFERENCIAS["rasgos_positivos"]: [r.value for r in self.rasgos_positivos],
            CLAVES_PREFERENCIAS["rasgos_negativos"]: [r.value for r in self.rasgos_negativos],
            CLAVES_PREFERENCIAS["hora_dormir"]: _hora_a_str(self.hora_dormir),
            CLAVES_PREFERENCIAS["hora_despertar"]: _hora_a_str(self.hora_despertar),
            CLAVES_PREFERENCIAS["tipo_horario_sueno"]: self.tipo_horario_sueno.value,
            CLAVES_PREFERENCIAS["tiene_pareja_invitar"]: self.tiene_pareja_invitar,
            CLAVES_PREFERENCIAS["tiene_mascotas"]: self.tiene_mascotas,
            CLAVES_PREFERENCIAS["planea_invitados"]: self.planea_invitados,
            CLAVES_PREFERENCIAS["acepta_mascotas"]: self.acepta_mascotas,
            CLAVES_PREFERENCIAS["acepta_invitados"]: self.acepta_invitados,
        }
        if not solo_informados:
            return d
        return {k: v for k, v in d.items()
                if v not in (None, False, [], "sin_dato")}

    def tiene_datos(self) -> bool:
        """True si al menos un campo fue respondido (un False explícito
        cuenta como dato; solo el defecto total da False)."""
        if any(e != e.__class__.SIN_DATO for e in (
                self.momento_aseo_semana, self.horario_aseo, self.estilo_cocina,
                self.tiempo_lavar_loza, self.fuente_ingresos,
                self.estabilidad_ingresos, self.tipo_horario_sueno)):
            return True
        if any(v is not None for v in (
                self.puntual_pagos, self.tiene_pareja_invitar, self.tiene_mascotas,
                self.planea_invitados, self.acepta_mascotas, self.acepta_invitados)):
            return True
        return bool(self.rasgos_positivos or self.rasgos_negativos
                    or self.hora_dormir or self.hora_despertar)

    @classmethod
    def from_dict(cls, data: dict | None) -> "Preferencias":
        """Construye desde el JSONB (tolera ausencias y claves extra)."""
        data = data or {}
        if not isinstance(data, dict):
            return cls()
        g = data.get
        return cls(
            momento_aseo_semana=_coerce_enum(
                MomentoAseoSemana, g(CLAVES_PREFERENCIAS["momento_aseo_semana"]),
                MomentoAseoSemana.SIN_DATO),
            horario_aseo=_coerce_enum(
                HorarioAseo, g(CLAVES_PREFERENCIAS["horario_aseo"]), HorarioAseo.SIN_DATO),
            estilo_cocina=_coerce_enum(
                EstiloCocina, g(CLAVES_PREFERENCIAS["estilo_cocina"]), EstiloCocina.SIN_DATO),
            tiempo_lavar_loza=_coerce_enum(
                TiempoLavarLoza, g(CLAVES_PREFERENCIAS["tiempo_lavar_loza"]),
                TiempoLavarLoza.SIN_DATO),
            fuente_ingresos=_coerce_enum(
                FuenteIngresos, g(CLAVES_PREFERENCIAS["fuente_ingresos"]),
                FuenteIngresos.SIN_DATO),
            estabilidad_ingresos=_coerce_enum(
                EstabilidadIngresos, g(CLAVES_PREFERENCIAS["estabilidad_ingresos"]),
                EstabilidadIngresos.SIN_DATO),
            puntual_pagos=_coerce_bool3(g(CLAVES_PREFERENCIAS["puntual_pagos"])),
            rasgos_positivos=_coerce_lista_enum(
                RasgoPositivo, g(CLAVES_PREFERENCIAS["rasgos_positivos"])),
            rasgos_negativos=_coerce_lista_enum(
                RasgoNegativo, g(CLAVES_PREFERENCIAS["rasgos_negativos"])),
            hora_dormir=_coerce_hora(g(CLAVES_PREFERENCIAS["hora_dormir"])),
            hora_despertar=_coerce_hora(g(CLAVES_PREFERENCIAS["hora_despertar"])),
            tipo_horario_sueno=_coerce_enum(
                TipoHorarioSueno, g(CLAVES_PREFERENCIAS["tipo_horario_sueno"]),
                TipoHorarioSueno.SIN_DATO),
            tiene_pareja_invitar=_coerce_bool3(g(CLAVES_PREFERENCIAS["tiene_pareja_invitar"])),
            tiene_mascotas=_coerce_bool3(g(CLAVES_PREFERENCIAS["tiene_mascotas"])),
            planea_invitados=_coerce_bool3(g(CLAVES_PREFERENCIAS["planea_invitados"])),
            acepta_mascotas=_coerce_bool3(g(CLAVES_PREFERENCIAS["acepta_mascotas"])),
            acepta_invitados=_coerce_bool3(g(CLAVES_PREFERENCIAS["acepta_invitados"])),
        )
