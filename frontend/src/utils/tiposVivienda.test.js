import { describe, it, expect } from 'vitest'
import { getEtiquetaTipo } from './tiposVivienda'

// Bloque 3: la fuente única prioriza dinámico > estático > crudo.
describe('getEtiquetaTipo (fuente única de etiquetas)', () => {
  it('sin slug retorna el placeholder de vacío', () => {
    expect(getEtiquetaTipo(null)).toBe('No informado')
    expect(getEtiquetaTipo('')).toBe('No informado')
    expect(getEtiquetaTipo(undefined, [], 'Vivienda')).toBe('Vivienda')
  })

  it('lista dinámica primero (un slug nuevo no existe en el fallback)', () => {
    const tipos = [{ slug: 'LOFT_X', nombre_visible: 'Loft X' }]
    expect(getEtiquetaTipo('LOFT_X', tipos)).toBe('Loft X')
    // Entrada dinámica sin nombre_visible cae al fallback estático.
    expect(getEtiquetaTipo('APARTAESTUDIO', [{ slug: 'APARTAESTUDIO' }])).toBe('Apartaestudio')
  })

  it('fallback estático para los 4 históricos sin necesidad de red', () => {
    expect(getEtiquetaTipo('HABITACION_INDEPENDIENTE', [])).toBe('Habitación independiente')
    expect(getEtiquetaTipo('COMPARTIDO', null)).toBe('Compartido')
  })

  it('slug desconocido se devuelve crudo (nunca vacío)', () => {
    expect(getEtiquetaTipo('DESCONOCIDO_9', [])).toBe('DESCONOCIDO_9')
  })
})
