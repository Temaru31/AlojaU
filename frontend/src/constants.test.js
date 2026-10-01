// constants.js v15.2: límites, rangos y tiempo relativo.
import { describe, it, expect } from 'vitest'
import { LIMITES, estadoRango, haceRelativo, estaDesactualizada } from './constants'

describe('LIMITES (contrato con backend)', () => {
  it('título 10-150 y descripción 20-2000', () => {
    expect(LIMITES.titulo).toEqual({ min: 10, max: 150 })
    expect(LIMITES.descripcion).toEqual({ min: 20, max: 2000 })
  })
})

describe('estadoRango', () => {
  it('mal bajo el mínimo, cerca sobre el 90%, ok en medio', () => {
    expect(estadoRango(5, 10, 150)).toBe('mal')
    expect(estadoRango(140, 10, 150)).toBe('cerca')
    expect(estadoRango(50, 10, 150)).toBe('ok')
  })
})

describe('haceRelativo', () => {
  it('formatea minutos, horas, días y nulos', () => {
    expect(haceRelativo(null)).toBeNull()
    expect(haceRelativo('no-fecha')).toBeNull()
    const ahora = Date.now()
    expect(haceRelativo(new Date(ahora - 3 * 86_400_000).toISOString())).toBe('hace 3 días')
    expect(haceRelativo(new Date(ahora - 2 * 3_600_000).toISOString())).toBe('hace 2 h')
  })
})

describe('estaDesactualizada', () => {
  it('true pasado el límite, false reciente o sin fecha', () => {
    const vieja = new Date(Date.now() - 40 * 86_400_000).toISOString()
    const nueva = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(estaDesactualizada(vieja, 30)).toBe(true)
    expect(estaDesactualizada(nueva, 30)).toBe(false)
    expect(estaDesactualizada(null)).toBe(false)
  })
})
