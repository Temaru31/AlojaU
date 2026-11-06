import { describe, it, expect } from 'vitest'
import { mensajeAmigable } from './api'

describe('api mensajeAmigable (español no-técnico)', () => {
  it('sin conexión/timeout sin respuesta', () => {
    expect(mensajeAmigable({ code: 'ECONNABORTED' })).toMatch(/perdiste la conexión/)
    expect(mensajeAmigable({})).toMatch(/perdiste la conexión/)
  })

  it('413 archivo grande -> tope 5 MB', () => {
    expect(mensajeAmigable({ response: { status: 413 } })).toMatch(/5 MB/)
  })

  it('401 sesión expirada', () => {
    expect(mensajeAmigable({ response: { status: 401 } })).toMatch(/sesión ha expirado/)
  })

  it('500 genérico técnico momentáneo', () => {
    expect(mensajeAmigable({ response: { status: 500 } })).toMatch(/problema técnico/)
    expect(mensajeAmigable({ response: { status: 503 } })).toMatch(/problema técnico/)
  })

  it('otros 4xx conservan detail del backend', () => {
    expect(mensajeAmigable({ response: { status: 422, data: { detail: 'Rango inválido' } } })).toBe('Rango inválido')
    expect(mensajeAmigable({ response: { status: 404, data: {} } })).toMatch(/No se pudo completar/)
  })
})
