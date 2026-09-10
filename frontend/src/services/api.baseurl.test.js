import { describe, it, expect } from 'vitest'
import { getApiBase } from './api'

describe('api getApiBase (fail-fast OLA2-M3)', () => {
  it('usa VITE_API_URL cuando está definida', () => {
    expect(getApiBase({ VITE_API_URL: 'https://aloja-u-api.onrender.com', PROD: true }))
      .toBe('https://aloja-u-api.onrender.com')
  })

  it('lanza en PROD sin VITE_API_URL (sin fallback silencioso a localhost)', () => {
    expect(() => getApiBase({ PROD: true })).toThrow(/VITE_API_URL/)
    expect(() => getApiBase({ VITE_API_URL: '', PROD: true })).toThrow(/VITE_API_URL/)
  })

  it('mantiene fallback localhost fuera de producción', () => {
    expect(getApiBase({ PROD: false })).toBe('http://localhost:8000')
    expect(getApiBase({})).toBe('http://localhost:8000')
  })
})
