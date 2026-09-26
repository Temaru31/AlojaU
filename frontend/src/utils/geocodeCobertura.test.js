import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

const CACHE_KEY = 'alojau_geocode_reverse_v1'

import { getDireccionCacheada, setDireccionCacheada, reverseGeocode } from './geocode'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('geocode cobertura (ramas honestas)', () => {
  it('JSON corrupto en caché retorna null sin lanzar', () => {
    localStorage.setItem(CACHE_KEY, 'corrupto{{{')
    expect(getDireccionCacheada(2.443, -76.606)).toBeNull()
  })

  it('item sin direccion retorna null', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ '2.4430,-76.6060': { ts: Date.now() } }))
    expect(getDireccionCacheada(2.443, -76.606)).toBeNull()
  })

  it('set con storage bloqueado no lanza (mapa sigue funcionando)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('lleno') })
    expect(() => setDireccionCacheada(1, 1, 'X')).not.toThrow()
  })

  it('reverseGeocode con res.ok=false retorna null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false })
    await expect(reverseGeocode(2.451, -76.599)).resolves.toBeNull()
  })

  it('reverseGeocode sin display_name retorna null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })
    await expect(reverseGeocode(2.452, -76.598)).resolves.toBeNull()
  })

  it('reverseGeocode guarda en caché al éxito', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ display_name: 'Parque Caldas, Popayán' }),
    })
    await expect(reverseGeocode(2.4418, -76.6064)).resolves.toBe('Parque Caldas, Popayán')
    expect(getDireccionCacheada(2.4418, -76.6064)).toBe('Parque Caldas, Popayán')
  })
})
