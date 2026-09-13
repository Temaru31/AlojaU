import { describe, it, expect } from 'vitest'
import { isRetryableError, retryDelayMs, API_MAX_RETRIES, API_TIMEOUT_MS, isCancelError } from './api'

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

  it('OLA4: abort (ERR_CANCELED) nunca se reintenta', () => {
    expect(isCancelError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isCancelError({ name: 'CanceledError' })).toBe(true)
    expect(isCancelError({})).toBe(false)
    expect(isCancelError({ code: 'ECONNABORTED' })).toBe(false)
    expect(isRetryableError({ code: 'ERR_CANCELED' })).toBe(false)
  })
})
