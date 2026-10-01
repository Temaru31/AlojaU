import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import useNotificaciones, { NOTIF_EVENT, NOTIF_POLL_MS } from './useNotificaciones'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))

function Probe({ token, onEstado }) {
  const estado = useNotificaciones({ token })
  if (onEstado) onEstado(estado)
  return null
}

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => vi.clearAllMocks())

const BANDEJA = {
  items: [{ id: 1, tipo: 'nuevo_arriendo', titulo: 'Aviso 1', cuerpo: '', publicacion_id: 7, leida: false, created_at: new Date().toISOString() }],
  total: 1, no_leidas: 1, page: 1, size: 20, pages: 1,
}

describe('useNotificaciones (Fase 3)', () => {
  it('sin token no pide la bandeja privada', async () => {
    render(<Probe token="" />)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.get).not.toHaveBeenCalled()
  })

  it('carga bandeja + no_leidas al montar', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    let visto = null
    render(<Probe token="t" onEstado={(e) => { visto = e }} />)
    await waitFor(() => expect(visto.noLeidas).toBe(1))
    expect(visto.items).toHaveLength(1)
    expect(api.get).toHaveBeenCalledWith('/api/notificaciones', expect.anything())
  })

  it('marcarLeida optimista + PATCH, con rollback si falla', async () => {
    // Servidor mutable: el re-fetch tras el éxito debe converger a leída.
    let leida = false
    api.get.mockImplementation(() => Promise.resolve({ data: {
      ...BANDEJA,
      items: [{ ...BANDEJA.items[0], leida }],
      no_leidas: leida ? 0 : 1,
    } }))
    api.patch.mockImplementation(async () => { leida = true; return { data: {} } })
    let visto = null
    render(<Probe token="t" onEstado={(e) => { visto = e }} />)
    await waitFor(() => expect(visto.noLeidas).toBe(1))
    await act(async () => { await visto.marcarLeida(1) })
    await waitFor(() => expect(visto.noLeidas).toBe(0))
    expect(api.patch).toHaveBeenCalledWith('/api/notificaciones/1/leer', {}, expect.anything())

    // Fallo de red: rollback al estado previo (sigue sin leer).
    leida = false
    api.patch.mockRejectedValueOnce(new Error('red'))
    await act(async () => { window.dispatchEvent(new Event('alojau:notificaciones-change')) })
    await waitFor(() => expect(visto.noLeidas).toBe(1))
    await act(async () => { await visto.marcarLeida(1) })
    expect(visto.noLeidas).toBe(1)
    expect(visto.items[0].leida).toBe(false)
  })

  it('marcarTodas llama al endpoint y limpia el badge', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    api.patch.mockResolvedValue({ data: { actualizadas: 1 } })
    let visto = null
    render(<Probe token="t" onEstado={(e) => { visto = e }} />)
    await waitFor(() => expect(visto.noLeidas).toBe(1))
    await act(async () => { await visto.marcarTodas() })
    expect(api.patch).toHaveBeenCalledWith('/api/notificaciones/leer-todas', {}, expect.anything())
    expect(visto.noLeidas).toBe(0)
  })

  it('evento de app refresca la lista', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    render(<Probe token="t" />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event(NOTIF_EVENT))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('revalida al enfocar la ventana', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    render(<Probe token="t" />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('polling cada 45 s solo con pestaña visible', async () => {
    expect(NOTIF_POLL_MS).toBe(45_000)
    vi.useFakeTimers()
    try {
      api.get.mockResolvedValue({ data: BANDEJA })
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      render(<Probe token="t" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(api.get).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(NOTIF_POLL_MS) })
      expect(api.get).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
