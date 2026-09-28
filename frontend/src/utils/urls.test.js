import { describe, it, expect } from 'vitest'
import { esHttpUrl, hostDe } from './urls'

describe('urls (validación estricta, sin substring)', () => {
  it('esHttpUrl acepta solo http/https reales', () => {
    expect(esHttpUrl('https://a.com/1.jpg')).toBe(true)
    expect(esHttpUrl('http://a.com/1.jpg')).toBe(true)
    expect(esHttpUrl('  https://a.com/x  ')).toBe(true)
    // Bypass clásicos del startsWith('http'):
    // 'http:evil.com' SÍ es http válido (WHATWG lo normaliza a http://…),
    // así que se acepta correctamente; lo que se rechaza es otro esquema.
    expect(esHttpUrl('http:evil.com')).toBe(true)
    expect(esHttpUrl('httpx://a.com')).toBe(false)
    expect(esHttpUrl('javascript:alert(1)')).toBe(false)
    expect(esHttpUrl('notaurl')).toBe(false)
    expect(esHttpUrl('')).toBe(false)
    expect(esHttpUrl(null)).toBe(false)
    expect(esHttpUrl(123)).toBe(false)
  })

  it('hostDe extrae host exacto o vacío', () => {
    expect(hostDe('https://images.unsplash.com/a?b=c')).toBe('images.unsplash.com')
    expect(hostDe('https://IMAGES.unsplash.com/a')).toBe('images.unsplash.com')
    expect(hostDe('https://evil.com/?x=images.unsplash.com')).toBe('evil.com')
    expect(hostDe('notaurl')).toBe('')
    expect(hostDe(null)).toBe('')
  })
})
