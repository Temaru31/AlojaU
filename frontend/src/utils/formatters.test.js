import { describe, it, expect } from 'vitest'
import { formatCOP, formatDistancia, getColorIndice, getLabelIndice } from './formatters'

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
  it('getColorIndice escala', ()=>{
    expect(getColorIndice(85)).toBe('green')
    expect(getColorIndice(60)).toBe('yellow')
    expect(getColorIndice(30)).toBe('orange')
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
})
