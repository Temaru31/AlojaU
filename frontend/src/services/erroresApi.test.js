import { describe, it, expect } from 'vitest'
import { mensajeDeError } from './erroresApi'

const conDetail = (detail, status = 422) => ({ response: { status, data: { detail } } })

describe('mensajeDeError', () => {
  it('devuelve el detail del backend cuando es texto', () => {
    expect(mensajeDeError(conDetail('Aviso no encontrado', 404), 'x')).toBe('Aviso no encontrado')
  })

  it('une los mensajes de un 422 de validación y quita el prefijo de Pydantic', () => {
    const detail = [
      { loc: ['body', 'detalle'], msg: 'Value error, no se permite HTML', type: 'value_error' },
      { loc: ['body', 'titulo'], msg: 'muy corto', type: 'string_too_short' },
    ]
    expect(mensajeDeError(conDetail(detail), 'x')).toBe('no se permite HTML | muy corto')
  })

  it('con conCampo antepone la ubicación del campo', () => {
    const detail = [{ loc: ['body', 'titulo'], msg: 'corto' }]
    expect(mensajeDeError(conDetail(detail), 'x', { conCampo: true })).toBe('body.titulo: corto')
  })

  it('siempre devuelve un texto, nunca un objeto', () => {
    expect(mensajeDeError(conDetail({ raro: true }), 'Por defecto')).toBe('Por defecto')
    expect(mensajeDeError(conDetail([{ sin: 'msg' }]), 'Por defecto')).toBe('Por defecto')
    expect(mensajeDeError(conDetail([]), 'Por defecto')).toBe('Por defecto')
  })

  it('usa el texto por defecto si no hay detail o no hay respuesta', () => {
    expect(mensajeDeError(conDetail('   '), 'Por defecto')).toBe('Por defecto')
    expect(mensajeDeError({ response: { status: 500, data: {} } }, 'Por defecto')).toBe('Por defecto')
    expect(mensajeDeError({}, 'Por defecto')).toBe('Por defecto')
    expect(mensajeDeError(undefined, 'Por defecto')).toBe('Por defecto')
  })
})
