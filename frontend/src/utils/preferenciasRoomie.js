/**
 * Utilidades para personalización de convivencia y emparejamiento de Roomies (HU-12 / HU-13).
 * Basado en las 5 dimensiones de "Opciones de personalización.pdf" y el motor de matching del backend.
 */

// Mapeo entre identificadores internos del formulario y claves JSONB en usuarios.preferencias
export const CLAVES_ROOMIE = {
  aseo_momento_semana: 'roomie.aseo_momento_semana',
  aseo_horario: 'roomie.aseo_horario',
  cocina_estilo: 'roomie.cocina_estilo',
  loza_tiempo: 'roomie.loza_tiempo',
  ingresos_fuente: 'roomie.ingresos_fuente',
  ingresos_estabilidad: 'roomie.ingresos_estabilidad',
  pagos_puntual: 'roomie.pagos_puntual',
  rasgos_positivos: 'roomie.rasgos_positivos',
  rasgos_negativos: 'roomie.rasgos_negativos',
  sueno_hora_dormir: 'roomie.sueno_hora_dormir',
  sueno_hora_despertar: 'roomie.sueno_hora_despertar',
  sueno_tipo: 'roomie.sueno_tipo',
  invitados_pareja: 'roomie.invitados_pareja',
  mascotas: 'roomie.mascotas',
  invitados_plan: 'roomie.invitados_plan',
  acepta_mascotas: 'roomie.acepta_mascotas',
  acepta_invitados: 'roomie.acepta_invitados',
}

// 5 Dimensiones oficiales del PDF para organizar la UI
export const DIMENSIONES_ROOMIE = [
  {
    id: 'higiene',
    punto: 1,
    titulo: 'Higiene y orden en zonas comunes',
    descripcion: 'Hábitos de aseo, limpieza en la cocina y cuidado de la vajilla.',
    campos: ['aseo_momento_semana', 'aseo_horario', 'cocina_estilo', 'loza_tiempo'],
  },
  {
    id: 'solvencia',
    punto: 2,
    titulo: 'Solvencia económica y pagos',
    descripcion: 'Fuente y estabilidad de ingresos, y puntualidad en el pago de facturas.',
    campos: ['ingresos_fuente', 'ingresos_estabilidad', 'pagos_puntual'],
  },
  {
    id: 'personalidad',
    punto: 3,
    titulo: 'Personalidad y resolución de conflictos',
    descripcion: 'Cualidades positivas y áreas de mejora (mínimo dos defectos requeridos).',
    campos: ['rasgos_positivos', 'rasgos_negativos'],
  },
  {
    id: 'sueno',
    punto: 4,
    titulo: 'Estilo de vida y horarios de sueño',
    descripcion: 'Horarios habituales para dormir/despertar y regularidad del descanso.',
    campos: ['sueno_hora_dormir', 'sueno_hora_despertar', 'sueno_tipo'],
  },
  {
    id: 'convivencia',
    punto: 5,
    titulo: 'Normas de invitados y mascotas',
    descripcion: 'Planes respecto a pareja, visitas y mascotas, junto con tu nivel de tolerancia.',
    campos: [
      'invitados_pareja',
      'mascotas',
      'invitados_plan',
      'acepta_mascotas',
      'acepta_invitados',
    ],
  },
]

// Catálogo de opciones con etiquetas en español (espejo del backend con fallback offline)
export const ENUMS_FALLBACK = {
  MomentoAseoSemana: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'entre_semana', etiqueta: 'Entre semana' },
    { valor: 'fin_de_semana', etiqueta: 'Fin de semana' },
  ],
  HorarioAseo: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'manana_6am_11am', etiqueta: 'Mañana (6AM - 11AM)' },
    { valor: 'tarde_12pm_6pm', etiqueta: 'Tarde (12PM - 6PM)' },
    { valor: 'noche_7pm_9pm', etiqueta: 'Noche (7PM - 9PM)' },
  ],
  EstiloCocina: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'organizado', etiqueta: 'Organizad@' },
    { valor: 'desorganizado', etiqueta: 'Desorganizad@' },
  ],
  TiempoLavarLoza: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'inmediatamente', etiqueta: 'Inmediatamente' },
    { valor: 'a_lo_largo_del_dia', etiqueta: 'A lo largo del día' },
    { valor: 'otro_dia_cuando_se_necesite', etiqueta: 'Otro día cuando lo vuelva a necesitar' },
  ],
  FuenteIngresos: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'trabajo_fijo', etiqueta: 'Trabajo fijo' },
    { valor: 'trabajo_independiente_emprendimiento', etiqueta: 'Trabajo independiente / Emprendimiento' },
    { valor: 'respaldo_familiar', etiqueta: 'Respaldo familiar' },
  ],
  EstabilidadIngresos: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'estable', etiqueta: 'Estable' },
    { valor: 'variable', etiqueta: 'Variable' },
    { valor: 'poco_estable', etiqueta: 'Poco estable' },
  ],
  RasgoPositivo: [
    { valor: 'respetuoso', etiqueta: 'Respetuoso' },
    { valor: 'tranquilo', etiqueta: 'Tranquilo' },
    { valor: 'paciente', etiqueta: 'Paciente' },
    { valor: 'buena_vibra', etiqueta: 'Buena vibra' },
  ],
  RasgoNegativo: [
    { valor: 'impaciente', etiqueta: 'Impaciente (Al menos un poco)' },
    { valor: 'bajo_manejo_frustracion', etiqueta: 'Bajo manejo de frustración' },
    { valor: 'malhumorado', etiqueta: 'Malhumorad@ (Al menos algunas veces)' },
    { valor: 'terco_orgulloso', etiqueta: 'Terc@ / Orgullos@' },
  ],
  TipoHorarioSueno: [
    { valor: 'sin_dato', etiqueta: 'Sin definir' },
    { valor: 'estable', etiqueta: 'Estable (Constante con algunas excepciones)' },
    { valor: 'variable', etiqueta: 'Variable (Constantemente cambiante)' },
  ],
}

// Mapa clave -> nombre del Enum en ENUMS_FALLBACK
export const CLAVE_A_ENUM = {
  aseo_momento_semana: 'MomentoAseoSemana',
  aseo_horario: 'HorarioAseo',
  cocina_estilo: 'EstiloCocina',
  loza_tiempo: 'TiempoLavarLoza',
  ingresos_fuente: 'FuenteIngresos',
  ingresos_estabilidad: 'EstabilidadIngresos',
  rasgos_positivos: 'RasgoPositivo',
  rasgos_negativos: 'RasgoNegativo',
  sueno_tipo: 'TipoHorarioSueno',
}

/**
 * Extrae las preferencias del usuario (objeto general que puede tener filtros.*, etc.)
 * y retorna un objeto limpio con los campos de roomie normalizados para el formulario.
 */
export function extraerPreferenciasRoomie(preferencias = {}) {
  const p = preferencias || {}
  const safeBool = (val) => (typeof val === 'boolean' ? val : null)
  const safeList = (val) => (Array.isArray(val) ? val.filter(Boolean) : [])

  return {
    aseo_momento_semana: p[CLAVES_ROOMIE.aseo_momento_semana] || 'sin_dato',
    aseo_horario: p[CLAVES_ROOMIE.aseo_horario] || 'sin_dato',
    cocina_estilo: p[CLAVES_ROOMIE.cocina_estilo] || 'sin_dato',
    loza_tiempo: p[CLAVES_ROOMIE.loza_tiempo] || 'sin_dato',
    ingresos_fuente: p[CLAVES_ROOMIE.ingresos_fuente] || 'sin_dato',
    ingresos_estabilidad: p[CLAVES_ROOMIE.ingresos_estabilidad] || 'sin_dato',
    pagos_puntual: safeBool(p[CLAVES_ROOMIE.pagos_puntual]),
    rasgos_positivos: safeList(p[CLAVES_ROOMIE.rasgos_positivos]),
    rasgos_negativos: safeList(p[CLAVES_ROOMIE.rasgos_negativos]),
    sueno_hora_dormir: p[CLAVES_ROOMIE.sueno_hora_dormir] || '',
    sueno_hora_despertar: p[CLAVES_ROOMIE.sueno_hora_despertar] || '',
    sueno_tipo: p[CLAVES_ROOMIE.sueno_tipo] || 'sin_dato',
    invitados_pareja: safeBool(p[CLAVES_ROOMIE.invitados_pareja]),
    mascotas: safeBool(p[CLAVES_ROOMIE.mascotas]),
    invitados_plan: safeBool(p[CLAVES_ROOMIE.invitados_plan]),
    acepta_mascotas: safeBool(p[CLAVES_ROOMIE.acepta_mascotas]),
    acepta_invitados: safeBool(p[CLAVES_ROOMIE.acepta_invitados]),
  }
}

/**
 * Empaqueta el estado del formulario de vuelta a un diccionario con claves "roomie.*"
 * listo para enviar en PATCH /api/auth/perfil.
 */
export function empaquetarPreferenciasRoomie(form = {}) {
  const resultado = {}

  Object.entries(CLAVES_ROOMIE).forEach(([campo, claveJson]) => {
    const val = form[campo]

    if (Array.isArray(val)) {
      resultado[claveJson] = val
    } else if (typeof val === 'boolean') {
      resultado[claveJson] = val
    } else if (val === null || val === undefined || val === '') {
      // Tri-estados o campos sin respuesta explícita
      resultado[claveJson] = null
    } else {
      resultado[claveJson] = val
    }
  })

  return resultado
}

/**
 * Verifica si un campo en particular cuenta como respondido (no vacío ni sin_dato).
 */
export function esCampoRespondido(campo, valor) {
  if (valor == null || valor === '') return false
  if (valor === 'sin_dato') return false
  if (Array.isArray(valor)) return valor.length > 0
  if (typeof valor === 'boolean') return true
  return true
}

/**
 * Calcula la completitud de las preferencias de convivencia (0 - 100%).
 * Retorna además el detalle por dimensión y si cumple para entrar al matching.
 */
export function calcularCompletitudRoomie(preferenciasOForm = {}) {
  // Si viene con claves roomie.*, lo normalizamos primero
  const form = Object.keys(preferenciasOForm).some((k) => k.startsWith('roomie.'))
    ? extraerPreferenciasRoomie(preferenciasOForm)
    : preferenciasOForm

  const camposTotales = Object.keys(CLAVES_ROOMIE)
  let respondidos = 0

  const porDimension = {}

  DIMENSIONES_ROOMIE.forEach((dim) => {
    let dimRespondidos = 0
    dim.campos.forEach((campo) => {
      const resp = esCampoRespondido(campo, form[campo])
      if (resp) {
        respondidos += 1
        dimRespondidos += 1
      }
    })
    porDimension[dim.id] = {
      titulo: dim.titulo,
      respondidos: dimRespondidos,
      total: dim.campos.length,
      porcentaje: Math.round((dimRespondidos / dim.campos.length) * 100),
    }
  })

  const porcentaje = Math.round((respondidos / camposTotales.length) * 100)
  const defectosCount = Array.isArray(form.rasgos_negativos) ? form.rasgos_negativos.length : 0
  const cumpleDefectosMinimos = defectosCount >= 2
  const esAptoMatching = respondidos >= 3 && cumpleDefectosMinimos

  return {
    porcentaje,
    respondidos,
    total: camposTotales.length,
    porDimension,
    cumpleDefectosMinimos,
    defectosCount,
    esAptoMatching,
  }
}

/**
 * Valida las reglas de negocio del PDF antes de guardar.
 * Regla clave: Si se personaliza la sección de carácter, mínimo dos defectos son necesarios.
 */
export function validarPreferenciasRoomie(form = {}) {
  const errores = {}
  const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

  const defectos = Array.isArray(form.rasgos_negativos) ? form.rasgos_negativos : []
  if (defectos.length > 0 && defectos.length < 2) {
    errores.rasgos_negativos = 'Debes seleccionar al menos 2 defectos o áreas de mejora (mínimo dos requeridos según el PDF).'
  }

  if (form.sueno_hora_dormir && !horaRegex.test(form.sueno_hora_dormir)) {
    errores.sueno_hora_dormir = 'La hora de dormir debe tener formato HH:MM (ej. 23:00).'
  }

  if (form.sueno_hora_despertar && !horaRegex.test(form.sueno_hora_despertar)) {
    errores.sueno_hora_despertar = 'La hora de despertar debe tener formato HH:MM (ej. 06:30).'
  }

  return {
    valido: Object.keys(errores).length === 0,
    errores,
  }
}

/**
 * Obtiene la etiqueta amigable para una opción según catálogo del backend o fallback.
 */
export function obtenerEtiquetaOpcion(enumNombre, valor, catalogoBackend = null) {
  if (!valor || valor === 'sin_dato') return 'Sin definir'

  // Si se pasó el catálogo devuelto por GET /api/preferencias/enums
  if (catalogoBackend && Array.isArray(catalogoBackend.enums)) {
    const enumEncontrado = catalogoBackend.enums.find((e) => e.nombre === enumNombre)
    if (enumEncontrado && Array.isArray(enumEncontrado.opciones)) {
      const opt = enumEncontrado.opciones.find((o) => o.valor === valor)
      if (opt && opt.etiqueta) return opt.etiqueta
    }
  }

  // Fallback local
  const lista = ENUMS_FALLBACK[enumNombre] || []
  const hit = lista.find((item) => item.valor === valor)
  return hit ? hit.etiqueta : String(valor)
}

/**
 * Clasifica el puntaje de compatibilidad (0 - 100) en las tres bandas oficiales:
 * - Alta: >= 80
 * - Media: 50 a 79
 * - Baja: < 50
 */
export function obtenerBandaCompatibilidad(score) {
  const num = typeof score === 'number' ? Math.round(score) : 0

  if (num >= 80) {
    return {
      banda: 'alta',
      etiqueta: 'Alta afinidad',
      porcentaje: num,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      barColor: 'bg-emerald-500',
      textColor: 'text-emerald-700',
    }
  }

  if (num >= 50) {
    return {
      banda: 'media',
      etiqueta: 'Afinidad media',
      porcentaje: num,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      barColor: 'bg-amber-500',
      textColor: 'text-amber-700',
    }
  }

  return {
    banda: 'baja',
    etiqueta: 'Baja afinidad',
    porcentaje: num,
    badgeClass: 'bg-neutral-100 text-neutral-700 border-neutral-300',
    barColor: 'bg-neutral-400',
    textColor: 'text-neutral-600',
  }
}
