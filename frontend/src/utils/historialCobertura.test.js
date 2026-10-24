import { describe, it, expect } from 'vitest'
import { etiquetaEvento, describirAuditoria, MENSAJE_AUDITORIA } from './historial'

// Colchón honesto M1: cubre cada rama de describirAuditoria con datos reales.
describe('historial cobertura (todas las ramas)', () => {
  it('etiquetaEvento: conocido, desconocido, null, undefined, vacío', () => {
    expect(etiquetaEvento('CREATED')).toBe('Creada')
    expect(etiquetaEvento('FUTURO_X')).toBe('FUTURO_X')
    expect(etiquetaEvento(null)).toBe('Evento')
    expect(etiquetaEvento(undefined)).toBe('Evento')
    expect(etiquetaEvento('')).toBe('Evento')
  })

  it('cada evento con pid incluye el número; sin pid usa forma sin número', () => {
    expect(MENSAJE_AUDITORIA.CREATED(7)).toBe('Creó el aviso #7')
    expect(MENSAJE_AUDITORIA.CREATED(null)).toBe('Creó un aviso')
    expect(MENSAJE_AUDITORIA.APPROVED(7)).toContain('#7')
    expect(MENSAJE_AUDITORIA.APPROVED(undefined)).toBe('Aprobó un aviso')
    expect(MENSAJE_AUDITORIA.REJECTED(3)).toContain('#3')
    expect(MENSAJE_AUDITORIA.REJECTED(null)).toBe('Rechazó un aviso')
    expect(MENSAJE_AUDITORIA.PAUSED(3)).toContain('#3')
    expect(MENSAJE_AUDITORIA.PAUSED(null)).toBe('Pausó un aviso')
    expect(MENSAJE_AUDITORIA.RESUMED(3)).toContain('#3')
    expect(MENSAJE_AUDITORIA.RESUMED(null)).toBe('Reanudó un aviso')
    expect(MENSAJE_AUDITORIA.RENTED(9)).toContain('#9')
    expect(MENSAJE_AUDITORIA.RENTED(null)).toContain('arrendado')
    expect(MENSAJE_AUDITORIA.EXPIRED(9)).toContain('#9')
    expect(MENSAJE_AUDITORIA.EXPIRED(null)).toBe('Expiró un aviso')
    expect(MENSAJE_AUDITORIA.RENEWED(14)).toBe('Renovó expiración del aviso #14')
    expect(MENSAJE_AUDITORIA.RENEWED(null)).toBe('Renovó un aviso')
    expect(MENSAJE_AUDITORIA.BLOCKED(5)).toContain('#5')
    expect(MENSAJE_AUDITORIA.BLOCKED(null)).toBe('Bloqueó un aviso')
    expect(MENSAJE_AUDITORIA.SETTINGS()).toBe('Actualizó ajustes del sistema')
    expect(MENSAJE_AUDITORIA.CUENTA_DELETE()).toBe('Eliminó su cuenta')
  })

  it('describirAuditoria: default {} sin evento', () => {
    expect(describirAuditoria()).toBe('Evento')
    expect(describirAuditoria({})).toBe('Evento')
  })

  it('mensaje_legible vacío ("") cae al fallback (falsy honesto)', () => {
    expect(describirAuditoria({ evento: 'APPROVED', publicacion_id: 7, mensaje_legible: '' }))
      .toBe('Aprobó el aviso #7')
  })

  it('evento desconocido con detalle solo-espacios no agrega sufijo', () => {
    expect(describirAuditoria({ evento: 'X9', publicacion_id: 3, detalle: '   ' })).toBe('X9 #3')
  })

  it('evento desconocido sin pid ni detalle usa solo etiqueta', () => {
    expect(describirAuditoria({ evento: 'X9', publicacion_id: null, detalle: null })).toBe('X9')
  })

  it('detalle largo se recorta a 140 caracteres', () => {
    const largo = 'a'.repeat(300)
    const t = describirAuditoria({ evento: 'X9', publicacion_id: 1, detalle: largo })
    expect(t.length).toBeLessThanOrEqual('X9 #1: '.length + 140)
    expect(t).toContain('aaa')
  })

  it('detalle con llaves y comillas se limpia', () => {
    const t = describirAuditoria({ evento: 'X9', publicacion_id: null, detalle: '{"a": 1}' })
    expect(t).not.toContain('{')
    expect(t).not.toContain('"')
    expect(t).toContain('a: 1')
  })
})
