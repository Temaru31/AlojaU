// Detalle #2: validate() usa LIMITES (fuente única, sin hardcode).
// Detalle #8: el gate de teléfono enlaza a /perfil#datos (tab directo).
import { describe, it, expect } from 'vitest'
import { validarPublicar } from './Publicar'
import { LIMITES } from '../constants'
import fs from 'node:fs'
import path from 'node:path'

const base = {
  titulo: 'Habitación de prueba con título largo',
  descripcion: 'Descripción con más de veinte caracteres válidos',
  canon_mensual: '450000',
  deposito_requerido: '0',
  zona_barrio_id: 3,
  barrio_texto: null,
  direccion_referencial: 'Calle 5 # 4-70 referencia',
  reglas_convivencia: 'No mascotas, visitas hasta las 9pm',
  latitud: '',
  longitud: '',
  servicios_ids: [1],
  fotos: ['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg'],
}

describe('validarPublicar usa LIMITES', () => {
  it('formulario válido no da errores', () => {
    expect(validarPublicar(base)).toEqual({})
  })

  it('respeta el límite alterado vía mock (no hardcode 10/150)', () => {
    const custom = { ...LIMITES, titulo: { min: 99, max: 100 } }
    const e = validarPublicar(base, custom)
    expect(e.titulo).toMatch(/99/)
    // Y con el límite real pasa.
    expect(validarPublicar(base).titulo).toBeUndefined()
  })

  it('usa fotosMin/canonMax de LIMITES', () => {
    expect(validarPublicar({ ...base, fotos: ['https://a/1.jpg'] }).fotos).toMatch(
      new RegExp(String(LIMITES.fotosMin)),
    )
    expect(
      validarPublicar({ ...base, canon_mensual: String(LIMITES.canonMax + 1) }).canon_mensual,
    ).toBeTruthy()
  })
})

describe('CTA de teléfono abre el tab datos (detalle #8)', () => {
  it('Publicar.jsx enlaza a /perfil#datos', () => {
    const src = fs.readFileSync(path.join(__dirname, 'Publicar.jsx'), 'utf8')
    expect(src).toContain('to="/perfil#datos"')
    expect(src).toContain('Datos y contacto')
  })
})
