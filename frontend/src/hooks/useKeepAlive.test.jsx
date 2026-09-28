import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import useKeepAlive, { KEEPALIVE_INTERVAL_MS } from './useKeepAlive'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))

function Probe() {
  useKeepAlive({ intervalMs: 50 })
  return null
}

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

describe('useKeepAlive (Bloque 3)', () => {
  it('expone el intervalo 10-12 min por defecto', () => {
    expect(KEEPALIVE_INTERVAL_MS).toBeGreaterThanOrEqual(10 * 60_000)
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThanOrEqual(12 * 60_000)
  })

  it('no pingeja en background y sí al volver a visible', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    render(<Probe />)
    await new Promise((r) => setTimeout(r, 120))
    expect(api.get).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 120))
    expect(api.get).toHaveBeenCalledWith('/health', expect.anything())
  })

  it('respeta el gap mínimo: dos visibles seguidos no duplican ping', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    render(<Probe />)
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 60))
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 60))
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('unmount limpia intervalo y listener (sin pings huérfanos)', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    const { unmount } = render(<Probe />)
    unmount()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 120))
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fallo de red silencioso (sin throw, sin banner propio)', async () => {
    api.get.mockRejectedValue(new Error('caído'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    render(<Probe />)
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 120))
    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
