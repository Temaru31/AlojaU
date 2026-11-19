import { describe, it, expect, afterEach } from 'vitest'
import { api, __resetApiTrackerForTests } from './api'

// NOTE: no se toca ./api.retry.test.js ni ./api.mensajes.test.js (helpers puros ya
// cubiertos). Aquí se ejercitan los interceptors del cliente axios con un adapter
// en memoria: sin red, sin timers lentos salvo 1 reintento real de 2s.
const ok = (data = { ok: true }) => (config) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })

const fail = (err) => () => Promise.reject(err)

const cfg = () => ({ __retryCount: 0, headers: {} })

afterEach(() => {
  __resetApiTrackerForTests()
})

describe('api interceptors (request/response + retry)', () => {
  it('petición exitosa resuelve con los datos', async () => {
    const res = await api.get('/api/campus', { adapter: ok([{ id: 1 }]) })
    expect(res.data).toEqual([{ id: 1 }])
  })

  it('error 400 adjunta el detail del backend como mensajeAmigable', async () => {
    const p = api.get('/x', {
      adapter: fail({ config: cfg(), response: { status: 400, data: { detail: 'Rango inválido' } } }),
    })
    await expect(p).rejects.toHaveProperty('mensajeAmigable', 'Rango inválido')
  })

  it('error 401 sin detail usa el mensaje de sesión expirada', async () => {
    const p = api.get('/x', {
      adapter: fail({ config: cfg(), response: { status: 401, data: {} }, message: 'x' }),
    })
    await expect(p).rejects.toHaveProperty('mensajeAmigable', expect.stringMatching(/sesión ha expirado/))
  })

  it('error sin config (sin respuesta) no se reintenta y avisa de conexión', async () => {
    const p = api.get('/x', { adapter: fail({ message: 'Network Error' }) })
    await expect(p).rejects.toHaveProperty('mensajeAmigable', expect.stringMatching(/conexión/))
  })

  it('petición cancelada (ERR_CANCELED) no se reintenta', async () => {
    const p = api.get('/x', {
      adapter: fail({ config: cfg(), code: 'ERR_CANCELED', message: 'canceled' }),
    })
    await expect(p).rejects.toHaveProperty('mensajeAmigable', expect.stringMatching(/conexión/))
  })

  it('503 reintenta una vez y resuelve si el backend ya responde', async () => {
    let calls = 0
    const flaky = (config) => {
      calls += 1
      if (calls === 1) {
        return Promise.reject({ config, response: { status: 503, data: {} }, message: 'cold start' })
      }
      return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })
    }
    const res = await api.get('/x', { adapter: flaky })
    expect(res.data).toEqual({ ok: true })
    expect(calls).toBe(2)
  }, 15000)
})
