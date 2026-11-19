import { describe, it, expect } from 'vitest'
import { describirAuditoria } from './historial'

describe('describirAuditoria (M1 human-readable)', () => {
  it('RENEWED #14 -> frase amigable del sprint', () => {
    expect(describirAuditoria({ evento: 'RENEWED', publicacion_id: 14 })).toBe('Renovó expiración del aviso #14')
  })

  it('prefiere mensaje_legible del backend (contrato aditivo)', () => {
    expect(describirAuditoria({ evento: 'APPROVED', publicacion_id: 7, mensaje_legible: 'Aprobó el aviso #7' })).toBe('Aprobó el aviso #7')
  })

  it('SETTINGS sin aviso -> ajuste del sistema', () => {
    expect(describirAuditoria({ evento: 'SETTINGS', publicacion_id: null })).toBe('Actualizó ajustes del sistema')
  })

  it('desconocido con detalle JSON no expone llaves crudas como principal', () => {
    const t = describirAuditoria({ evento: 'X', publicacion_id: 3, detalle: '{"a":1}' })
    expect(t).toContain('#3')
    expect(t).not.toBe('{"a":1}')
  })
})
