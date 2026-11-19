// Detalle #2: validate() usa LIMITES (fuente única, sin hardcode).
// Detalle #8: el gate de teléfono enlaza a /perfil#datos (tab directo).
import { describe, it, expect } from 'vitest'
import { armarPayloadPublicacion, esFotoEjemplo, sanitizarTexto, validarPublicar } from '../utils/publicar'
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

describe('esFotoEjemplo (CodeQL: host parseado, nunca subcadena)', () => {
  it('detecta el host exacto y subdominios (insensible a mayúsculas)', () => {
    expect(esFotoEjemplo('https://images.unsplash.com/photo-123?w=800')).toBe(true)
    expect(esFotoEjemplo('https://IMAGES.UNSPLASH.COM/photo-123')).toBe(true)
    expect(esFotoEjemplo('https://foo.unsplash.com/x')).toBe(true)
  })

  it('no marca falso positivo en query ni en otros hosts', () => {
    expect(esFotoEjemplo('https://evil.com/?x=images.unsplash.com')).toBe(false)
    expect(esFotoEjemplo('https://a.com/1.jpg')).toBe(false)
    expect(esFotoEjemplo('images.unsplash.com/photo-123')).toBe(true) // relativa con host real
    expect(esFotoEjemplo('/uploads/abc.jpg')).toBe(false)
    expect(esFotoEjemplo('')).toBe(false)
    expect(esFotoEjemplo(null)).toBe(false)
  })
})

describe('CTA de teléfono abre el tab datos (detalle #8)', () => {
  it('Publicar.jsx enlaza a /perfil#datos', () => {
    const src = fs.readFileSync(path.join(__dirname, 'Publicar.jsx'), 'utf8')
    expect(src).toContain('to="/perfil#datos"')
    expect(src).toContain('Datos y contacto')
  })
})

describe('armarPayloadPublicacion', () => {
  const FORM = {
    titulo: '  Habitación <b>amplia</b>  ', descripcion: 'Descripción larga', tipo_inmueble: 'APARTAESTUDIO',
    canon_mensual: '$ 850.000', deposito_requerido: '', zona_barrio_id: '3', barrio_texto: '',
    direccion_referencial: 'Calle 5 # 4-20', reglas_convivencia: 'Sin fiestas',
    latitud: '', longitud: '-76.6', servicios_ids: [1, 2], fotos: ['https://a/1.jpg', '  ', 'https://a/2.jpg'],
  }

  it('convierte montos y coordenadas y descarta fotos vacías', () => {
    const p = armarPayloadPublicacion(FORM)
    expect(p.canon_mensual).toBe(850000)
    expect(p.deposito_requerido).toBe(0)
    expect(p.zona_barrio_id).toBe(3)
    expect(p.barrio_texto).toBeNull()
    expect(p.latitud).toBeNull()
    expect(p.longitud).toBe(-76.6)
    expect(p.fotos).toEqual(['https://a/1.jpg', 'https://a/2.jpg'])
    expect(p.campus_ids).toEqual([])
  })

  it('sanea los textos', () => {
    expect(armarPayloadPublicacion(FORM).titulo).toBe(sanitizarTexto(FORM.titulo, 150))
  })
})
