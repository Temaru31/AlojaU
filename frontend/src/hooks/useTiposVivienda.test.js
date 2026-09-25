import { describe, it, expect } from 'vitest'
import { TIPOS_FALLBACK, nombreTipo } from './useTiposVivienda'

describe('useTiposVivienda (M2 fallback + nombres)', () => {
  it('fallback trae los 6 slugs (4 históricos + 2 nuevos, sin renombrar)', () => {
    const slugs = TIPOS_FALLBACK.map((t) => t.slug)
    for (const s of ['HABITACION_FAMILIAR', 'HABITACION_INDEPENDIENTE', 'APARTAESTUDIO', 'COMPARTIDO', 'APARTAMENTO_COMPLETO', 'HABITACION_PISO_COMPARTIDO']) {
      expect(slugs).toContain(s)
    }
  })

  it('nombreTipo: dinámico primero, fallback después, crudo al final', () => {
    const tipos = [{ slug: 'LOFT_X', nombre_visible: 'Loft X' }]
    expect(nombreTipo(tipos, 'LOFT_X')).toBe('Loft X')
    expect(nombreTipo([], 'APARTAESTUDIO')).toBe('Apartaestudio')
    expect(nombreTipo([], 'DESCONOCIDO_9')).toBe('DESCONOCIDO_9')
  })
})
