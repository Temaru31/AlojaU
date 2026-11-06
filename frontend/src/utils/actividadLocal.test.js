import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarContacto, leerContactos, registrarVisto } from './actividadLocal'

describe('actividadLocal', () => {
  beforeEach(() => localStorage.clear())

  it('guarda contactos sin duplicar', () => {
    guardarContacto(1, 'Aviso 1')
    guardarContacto(1, 'Aviso 1 otra vez')
    guardarContacto(2, '')
    expect(leerContactos().map(c => c.id)).toEqual([1, 2])
  })

  it('limita los contactos a 100', () => {
    for (let i = 0; i < 105; i += 1) guardarContacto(i, '')
    const ids = leerContactos().map(c => c.id)
    expect(ids).toHaveLength(100)
    expect(ids[0]).toBe(5)
  })

  it('pone el último visto al inicio, sin duplicados y con tope 30', () => {
    for (let i = 0; i < 35; i += 1) registrarVisto({ id: i, titulo: `t${i}` })
    registrarVisto({ id: 10, titulo: 't10' })
    const vistos = JSON.parse(localStorage.getItem('alojau_historial'))
    expect(vistos).toHaveLength(30)
    expect(vistos[0].id).toBe(10)
    expect(vistos.filter(v => v.id === 10)).toHaveLength(1)
  })

  it('no falla si el storage está corrupto o bloqueado', () => {
    localStorage.setItem('alojau_contactos', '{no es json')
    expect(leerContactos()).toEqual([])
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(() => registrarVisto({ id: 1 })).not.toThrow()
    expect(guardarContacto(1, '')).toEqual([])
    espia.mockRestore()
  })
})
