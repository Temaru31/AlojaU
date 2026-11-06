import { describe, it, expect } from 'vitest'
import { referenciaDeLugar } from './referenciaLugar'

const LUGARES = [{ id: 7, institucion: 'Unicauca', nombre_sede: 'Sede Única', latitud: 2.44, longitud: -76.6 }]

describe('referenciaDeLugar', () => {
  it('prefiere campus_ref del backend', () => {
    const pub = { campus_ref: { latitud: 1, longitud: 2, institucion: 'FUP', nombre_sede: 'Centro', dist_m: 300 } }
    expect(referenciaDeLugar(pub, LUGARES, '7')).toEqual({
      lugar: { lat: 1, lng: 2, nombre: 'FUP - Centro' },
      distMapa: 300,
      etiquetaDist: 'Distancia a Centro',
    })
  })

  it('con ?campus_id= usa el catálogo y no hereda otra distancia', () => {
    const r = referenciaDeLugar({ distancia_geodesica_m: 900 }, LUGARES, '7')
    expect(r.lugar).toEqual({ lat: 2.44, lng: -76.6, nombre: 'Unicauca' })
    expect(r.distMapa).toBeNull()
    expect(r.etiquetaDist).toBe('Distancia a Unicauca')
  })

  it('sin lugar elegido: modo inmueble único con la distancia mínima', () => {
    expect(referenciaDeLugar({ distancia_geodesica_m: 900 }, LUGARES, null)).toEqual({
      lugar: null, distMapa: 900, etiquetaDist: 'Distancia al campus',
    })
  })

  it('campus_id desconocido se trata como sin lugar', () => {
    expect(referenciaDeLugar({ dist_m: 50 }, LUGARES, '99').lugar).toBeNull()
  })
})
