import { describe, it, expect, beforeEach } from 'vitest'
import {
  CAMPUS_FILTRO_KEY,
  BUSCAR_FILTROS_KEY,
  guardarCampusFiltro,
  leerCampusFiltro,
  resolverCampusId,
  guardarFiltrosBuscar,
  leerFiltrosBuscar,
  limpiarFiltrosBuscar,
} from './persistenciaBuscar'

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear() } catch { /* noop */ }
})

describe('persistenciaBuscar (filtros globales + volver sin perder)', () => {
  it('campus global: guardar explícito; resolver es puro (sin side-effects)', () => {
    expect(leerCampusFiltro()).toBe('')
    // resolver NO escribe (apto para render): solo resuelve.
    expect(resolverCampusId('2')).toBe('2')
    expect(localStorage.getItem(CAMPUS_FILTRO_KEY)).toBeNull()
    guardarCampusFiltro('2')
    expect(localStorage.getItem(CAMPUS_FILTRO_KEY)).toBe('2')
    // Otra ruta sin param (Comparar) resuelve el guardado.
    expect(resolverCampusId(null)).toBe('2')
    expect(resolverCampusId('')).toBe('2')
    guardarCampusFiltro('')
    expect(leerCampusFiltro()).toBe('')
    expect(resolverCampusId(null)).toBe('')
  })

  it('snapshot de búsqueda: guarda, lee y limpia', () => {
    expect(leerFiltrosBuscar()).toBeNull()
    const snap = { filtros: { min: '400000', max: '', tipo: 'APARTAESTUDIO', servicios: '1,2' }, campus_id: '1', ciudad_id: '', q: 'tulcan' }
    guardarFiltrosBuscar(snap)
    expect(JSON.parse(sessionStorage.getItem(BUSCAR_FILTROS_KEY))).toMatchObject({ campus_id: '1', q: 'tulcan' })
    expect(leerFiltrosBuscar()).toMatchObject(snap)
    limpiarFiltrosBuscar()
    expect(leerFiltrosBuscar()).toBeNull()
  })

  it('bordes: JSON corrupto, formas inválidas e ids no numéricos', () => {
    sessionStorage.setItem(BUSCAR_FILTROS_KEY, '{no-json')
    expect(leerFiltrosBuscar()).toBeNull()
    sessionStorage.setItem(BUSCAR_FILTROS_KEY, '"solo-string"')
    expect(leerFiltrosBuscar()).toBeNull()
    sessionStorage.setItem(BUSCAR_FILTROS_KEY, 'null')
    expect(leerFiltrosBuscar()).toBeNull()
    // resolverCampusId nunca persiste basura ni retorna inválidos.
    expect(resolverCampusId('abc')).toBe('')
    expect(resolverCampusId('0')).toBe('')
    expect(resolverCampusId(undefined)).toBe('')
    expect(resolverCampusId('3')).toBe('3')
    expect(localStorage.getItem(CAMPUS_FILTRO_KEY)).toBeNull()
    guardarCampusFiltro('abc')
    expect(resolverCampusId(null)).toBe('')
  })
})
