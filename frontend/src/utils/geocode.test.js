import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const CACHE_KEY = 'alojau_geocode_reverse_v1'

import { getDireccionCacheada, setDireccionCacheada, reverseGeocode } from './geocode'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('geocode caché 30 días', () => {
  it('retorna null sin caché', () => {
    expect(getDireccionCacheada(2.443, -76.606)).toBeNull()
  })

  it('guarda y lee (redondeo 4 decimales)', () => {
    setDireccionCacheada(2.44301, -76.60601, 'Calle 5, Popayán')
    expect(getDireccionCacheada(2.44302, -76.60602)).toBe('Calle 5, Popayán')
  })

  it('expirada retorna null', () => {
    setDireccionCacheada(2.443, -76.606, 'Vieja')
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY))
    const k = Object.keys(raw)[0]
    raw[k].ts = Date.now() - 31 * 24 * 3600 * 1000
    localStorage.setItem(CACHE_KEY, JSON.stringify(raw))
    expect(getDireccionCacheada(2.443, -76.606)).toBeNull()
  })

  it('usa caché sin fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    setDireccionCacheada(2.443, -76.606, 'Cacheada')
    await expect(reverseGeocode(2.443, -76.606)).resolves.toBe('Cacheada')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falla suave (null, sin throw) si Nominatim cae', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('red caída'))
    await expect(reverseGeocode(2.45, -76.61)).resolves.toBeNull()
  })
})
