import { describe, it, expect } from 'vitest'
import { EVENTO_LABEL, etiquetaEvento } from './historial'

describe('historial (etiquetas humanas)', () => {
  it('traduce eventos conocidos y conserva desconocidos sin romper', () => {
    expect(etiquetaEvento('CREATED')).toBe('Creada')
    expect(etiquetaEvento('PAUSED')).toBe('Pausada')
    expect(etiquetaEvento('SETTINGS')).toBe('Ajuste del sistema')
    expect(etiquetaEvento('EVENTO_FUTURO')).toBe('EVENTO_FUTURO')
    expect(etiquetaEvento(null)).toBe('Evento')
    expect(etiquetaEvento(undefined)).toBe('Evento')
  })

  it('catálogo cubre todos los eventos del CHECK de BD', () => {
    for (const e of ['CREATED', 'APPROVED', 'REJECTED', 'PAUSED', 'RESUMED', 'RENTED', 'EXPIRED', 'RENEWED', 'BLOCKED', 'SETTINGS', 'CUENTA_DELETE']) {
      expect(EVENTO_LABEL[e]).toBeTruthy()
    }
  })
})
