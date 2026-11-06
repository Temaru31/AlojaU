import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerRutaPie, OSRM_TIMEOUT_MS } from './osrm'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const ORIGEN = { lat: 2.443, lng: -76.606 }
const DESTINO = { lat: 2.4451, lng: -76.6085 }

describe('obtenerRutaPie (OSRM progresivo)', () => {
  it('retorna distM/mins con la URL foot correcta', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distance: 410.5, duration: 372 }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await obtenerRutaPie({ origen: ORIGEN, destino: DESTINO })
    expect(r).toEqual({ distM: 411, mins: 6 })
    const url = fetchMock.mock.calls[0][0]
    expect(url).toContain('route/v1/foot/-76.606,2.443;-76.6085,2.4451')
    expect(OSRM_TIMEOUT_MS).toBe(4000)
  })

  it('fallo de red / HTTP !ok / sin rutas -> null (fallback a fórmula)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red caída') }))
    expect(await obtenerRutaPie({ origen: ORIGEN, destino: DESTINO })).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    expect(await obtenerRutaPie({ origen: ORIGEN, destino: DESTINO })).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ routes: [] }) })))
    expect(await obtenerRutaPie({ origen: ORIGEN, destino: DESTINO })).toBeNull()
  })

  it('coords inválidas no hacen fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await obtenerRutaPie({ origen: null, destino: DESTINO })).toBeNull()
    expect(await obtenerRutaPie({ origen: ORIGEN, destino: { lat: '', lng: '' } })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
