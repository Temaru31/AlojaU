import { describe, it, expect, vi, afterEach } from 'vitest'
import { isRetryableError, retryDelayMs, API_MAX_RETRIES, API_TIMEOUT_MS, isCancelError, API_SLOW_THRESHOLD_MS, __resetApiTrackerForTests, api } from './api'

describe('api retry cold-start', () => {
  it('timeout amplio para Render (30-50s)', () => {
    expect(API_TIMEOUT_MS).toBeGreaterThanOrEqual(45000)
  })

  it('máximo 2 reintentos', () => {
    expect(API_MAX_RETRIES).toBe(2)
  })

  it('reintenta timeout/red sin respuesta', () => {
    expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true)
    expect(isRetryableError({})).toBe(true)
  })

  it('reintenta 502/503/504, no 4xx', () => {
    expect(isRetryableError({ response: { status: 503 } })).toBe(true)
    expect(isRetryableError({ response: { status: 504 } })).toBe(true)
    expect(isRetryableError({ response: { status: 400 } })).toBe(false)
    expect(isRetryableError({ response: { status: 401 } })).toBe(false)
    expect(isRetryableError({ response: { status: 404 } })).toBe(false)
  })

  it('backoff 2s, 4s con tope', () => {
    expect(retryDelayMs(0)).toBe(2000)
    expect(retryDelayMs(1)).toBe(4000)
    expect(retryDelayMs(5)).toBeLessThanOrEqual(5000)
  })

  it('M7: toast de cold-start con debounce 3.5s', () => {
    expect(API_SLOW_THRESHOLD_MS).toBe(3500)
  })

  it('M7: respuesta rápida no dispara slow-start; lenta sí y al terminar emite slow-end', async () => {
    vi.useFakeTimers()
    const eventos = []
    const onStart = () => eventos.push('start')
    const onEnd = () => eventos.push('end')
    window.addEventListener('alojau:api-slow-start', onStart)
    window.addEventListener('alojau:api-slow-end', onEnd)
    try {
      __resetApiTrackerForTests()
      // Rápida: resuelve antes del umbral -> sin eventos.
      const rapida = api.get('/x', { adapter: () => Promise.resolve({ data: 1 }) })
      await vi.advanceTimersByTimeAsync(1000)
      await rapida
      expect(eventos).toEqual([])
      // Lenta: supera 3.5s -> start; al resolver -> end.
      __resetApiTrackerForTests()
      let resolver
      const lenta = api.get('/x', { adapter: () => new Promise((res) => { resolver = res }) })
      await vi.advanceTimersByTimeAsync(3500)
      expect(eventos).toEqual(['start'])
      resolver({ data: 1, status: 200, statusText: 'OK', headers: {}, config: {} })
      await lenta
      expect(eventos).toEqual(['start', 'end'])
    } finally {
      window.removeEventListener('alojau:api-slow-start', onStart)
      window.removeEventListener('alojau:api-slow-end', onEnd)
      __resetApiTrackerForTests()
      vi.useRealTimers()
    }
  })

  it('OLA4: abort (ERR_CANCELED) nunca se reintenta', () => {
    expect(isCancelError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isCancelError({ name: 'CanceledError' })).toBe(true)
    expect(isCancelError({})).toBe(false)
    expect(isCancelError({ code: 'ECONNABORTED' })).toBe(false)
    expect(isRetryableError({ code: 'ERR_CANCELED' })).toBe(false)
  })
})
