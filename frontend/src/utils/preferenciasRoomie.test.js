import { describe, it, expect } from 'vitest'
import {
  CLAVES_ROOMIE,
  DIMENSIONES_ROOMIE,
  ENUMS_FALLBACK,
  extraerPreferenciasRoomie,
  empaquetarPreferenciasRoomie,
  calcularCompletitudRoomie,
  validarPreferenciasRoomie,
  obtenerEtiquetaOpcion,
  obtenerBandaCompatibilidad,
} from './preferenciasRoomie'

describe('preferenciasRoomie utils', () => {
  it('tiene 17 claves mapeadas y 5 dimensiones del PDF', () => {
    expect(Object.keys(CLAVES_ROOMIE)).toHaveLength(17)
    expect(DIMENSIONES_ROOMIE).toHaveLength(5)
    expect(ENUMS_FALLBACK.MomentoAseoSemana).toBeDefined()
    expect(ENUMS_FALLBACK.RasgoNegativo).toHaveLength(4)
  })

  it('extrae preferencias desde el objeto del backend con valores por defecto seguros', () => {
    const rawBackend = {
      'filtros.tranquilo': true,
      'roomie.aseo_momento_semana': 'entre_semana',
      'roomie.pagos_puntual': true,
      'roomie.rasgos_negativos': ['impaciente', 'malhumorado'],
    }

    const form = extraerPreferenciasRoomie(rawBackend)
    expect(form.aseo_momento_semana).toBe('entre_semana')
    expect(form.pagos_puntual).toBe(true)
    expect(form.rasgos_negativos).toEqual(['impaciente', 'malhumorado'])
    // Valores no informados deben ser sin_dato, null o []
    expect(form.aseo_horario).toBe('sin_dato')
    expect(form.mascotas).toBeNull()
    expect(form.rasgos_positivos).toEqual([])
  })

  it('empaqueta el estado del formulario hacia claves roomie.*', () => {
    const form = {
      aseo_momento_semana: 'fin_de_semana',
      aseo_horario: 'manana_6am_11am',
      cocina_estilo: 'organizado',
      loza_tiempo: 'inmediatamente',
      ingresos_fuente: 'trabajo_fijo',
      ingresos_estabilidad: 'estable',
      pagos_puntual: true,
      rasgos_positivos: ['respetuoso', 'paciente'],
      rasgos_negativos: ['impaciente', 'malhumorado'],
      sueno_hora_dormir: '23:00',
      sueno_hora_despertar: '06:30',
      sueno_tipo: 'estable',
      invitados_pareja: false,
      mascotas: true,
      invitados_plan: true,
      acepta_mascotas: true,
      acepta_invitados: true,
    }

    const empaquetado = empaquetarPreferenciasRoomie(form)
    expect(empaquetado['roomie.aseo_momento_semana']).toBe('fin_de_semana')
    expect(empaquetado['roomie.pagos_puntual']).toBe(true)
    expect(empaquetado['roomie.rasgos_negativos']).toEqual(['impaciente', 'malhumorado'])
    expect(empaquetado['roomie.sueno_hora_dormir']).toBe('23:00')
    expect(empaquetado['roomie.invitados_pareja']).toBe(false)
  })

  it('calcula la completitud y verifica si es apto para matching', () => {
    // Caso vacío
    const vacio = calcularCompletitudRoomie({})
    expect(vacio.porcentaje).toBe(0)
    expect(vacio.esAptoMatching).toBe(false)
    expect(vacio.cumpleDefectosMinimos).toBe(false)

    // Caso completo
    const formCompleto = {
      aseo_momento_semana: 'entre_semana',
      aseo_horario: 'manana_6am_11am',
      cocina_estilo: 'organizado',
      loza_tiempo: 'inmediatamente',
      ingresos_fuente: 'trabajo_fijo',
      ingresos_estabilidad: 'estable',
      pagos_puntual: true,
      rasgos_positivos: ['respetuoso'],
      rasgos_negativos: ['impaciente', 'malhumorado'],
      sueno_hora_dormir: '22:30',
      sueno_hora_despertar: '06:00',
      sueno_tipo: 'estable',
      invitados_pareja: false,
      mascotas: false,
      invitados_plan: false,
      acepta_mascotas: true,
      acepta_invitados: true,
    }

    const lleno = calcularCompletitudRoomie(formCompleto)
    expect(lleno.porcentaje).toBe(100)
    expect(lleno.respondidos).toBe(17)
    expect(lleno.cumpleDefectosMinimos).toBe(true)
    expect(lleno.esAptoMatching).toBe(true)
    expect(lleno.porDimension.higiene.porcentaje).toBe(100)
  })

  it('valida regla de negocio: mínimo 2 defectos requeridos y formato de hora', () => {
    // 1 defecto -> debe arrojar error
    const conUnDefecto = validarPreferenciasRoomie({
      rasgos_negativos: ['impaciente'],
    })
    expect(conUnDefecto.valido).toBe(false)
    expect(conUnDefecto.errores.rasgos_negativos).toContain('mínimo')

    // 2 defectos -> válido
    const conDosDefectos = validarPreferenciasRoomie({
      rasgos_negativos: ['impaciente', 'terco_orgulloso'],
    })
    expect(conDosDefectos.valido).toBe(true)

    // Hora inválida
    const conHoraMala = validarPreferenciasRoomie({
      sueno_hora_dormir: '25:99',
    })
    expect(conHoraMala.valido).toBe(false)
    expect(conHoraMala.errores.sueno_hora_dormir).toBeDefined()
  })

  it('obtiene etiquetas con fallback local y con catálogo del backend', () => {
    // Con fallback
    expect(obtenerEtiquetaOpcion('MomentoAseoSemana', 'entre_semana')).toBe('Entre semana')
    expect(obtenerEtiquetaOpcion('RasgoPositivo', 'buena_vibra')).toBe('Buena vibra')
    expect(obtenerEtiquetaOpcion('MomentoAseoSemana', 'sin_dato')).toBe('Sin definir')

    // Con catálogo devuelto por backend
    const catalogoMock = {
      enums: [
        {
          nombre: 'MomentoAseoSemana',
          opciones: [
            { valor: 'entre_semana', etiqueta: 'Días laborales (Lunes a Viernes)' },
          ],
        },
      ],
    }
    expect(obtenerEtiquetaOpcion('MomentoAseoSemana', 'entre_semana', catalogoMock)).toBe(
      'Días laborales (Lunes a Viernes)',
    )
  })

  it('clasifica puntaje en bandas de afinidad alta, media y baja', () => {
    const alta = obtenerBandaCompatibilidad(92)
    expect(alta.banda).toBe('alta')
    expect(alta.etiqueta).toBe('Alta afinidad')
    expect(alta.porcentaje).toBe(92)

    const media = obtenerBandaCompatibilidad(65)
    expect(media.banda).toBe('media')
    expect(media.etiqueta).toBe('Afinidad media')

    const baja = obtenerBandaCompatibilidad(42)
    expect(baja.banda).toBe('baja')
    expect(baja.etiqueta).toBe('Baja afinidad')
  })
})
