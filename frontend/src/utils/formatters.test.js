import { describe, it, expect } from 'vitest'
import { formatCOP, formatDistancia, getColorIndice, getLabelIndice, formatTiempoCaminando, formatDistanciaConTiempo, formatDistanciaPeatonal, PEATONAL_FACTOR, VELOCIDAD_M_MIN } from './formatters'

describe('formatters', ()=>{
  it('formatCOP formatea moneda COP', ()=>{
    const s = formatCOP(480000)
    expect(s).toContain('480')
    expect(s).toContain('$')
  })
  it('formatCOP con null no explota', ()=>{
    expect(formatCOP(null)).toBeUndefined()
    expect(formatCOP(undefined)).toBeUndefined()
  })
  it('formatDistancia <1000 muestra m', ()=>{
    expect(formatDistancia(320)).toBe('320 m')
    expect(formatDistancia(999)).toBe('999 m')
  })
  it('formatDistancia >=1000 muestra km', ()=>{
    expect(formatDistancia(1500)).toBe('1.5 km')
    expect(formatDistancia(1000)).toBe('1.0 km')
  })
  it('getColorIndice escala (verde/naranja/rojo, sin amarillo corporativo)', ()=>{
    expect(getColorIndice(85)).toBe('emerald')
    expect(getColorIndice(60)).toBe('orange')
    expect(getColorIndice(30)).toBe('red')
  })
  it('getLabelIndice', ()=>{
    expect(getLabelIndice(85)).toBe('Alto')
    expect(getLabelIndice(60)).toBe('Medio')
    expect(getLabelIndice(10)).toBe('Básico')
  })
  it('no desborda con números grandes', ()=>{
    const s = formatCOP(10000000)
    expect(s.length).toBeLessThan(30)
  })
  it('formatTiempoCaminando peatonal (×1.28, 66 m/min)', ()=>{
    expect(PEATONAL_FACTOR).toBe(1.28)
    expect(VELOCIDAD_M_MIN).toBe(66)
    expect(formatTiempoCaminando(30)).toBe('<1 min a pie') // 38.4 < 66
    expect(formatTiempoCaminando(80)).toBe('~2 min a pie') // 102.4/66=1.55 -> 2
    expect(formatTiempoCaminando(111)).toBe('~2 min a pie')
    expect(formatTiempoCaminando(160)).toBe('~3 min a pie')
    expect(formatTiempoCaminando(780)).toBe('~15 min a pie')
    expect(formatTiempoCaminando(null)).toBeNull()
    expect(formatTiempoCaminando(5000)).toBe('~1h 37min a pie')
  })
  it('formatDistanciaPeatonal aplica tortuosidad', ()=>{
    expect(formatDistanciaPeatonal(1000)).toBe('1.3 km') // 1280 m
    expect(formatDistanciaPeatonal(null)).toBe('No informado')
  })
  it('formatDistanciaConTiempo combina', ()=>{
    expect(formatDistanciaConTiempo(320)).toBe('320 m • ~6 min a pie')
    expect(formatDistanciaConTiempo(null)).toBe('No informado')
  })
})
