// Cliente Axios - HU-001/002/003 + UX cold-start Render.
// Retry con backoff para cold start 30-50s + eventos lentitud para banner discreto.
// Uso: import { api } from './services/api'. Ej: api.get('/api/campus') reintenta 503/timeout solo.
import axios from 'axios'

export const API_TIMEOUT_MS = 55000
export const API_MAX_RETRIES = 2
export const API_SLOW_THRESHOLD_MS = 4000
const RETRYABLE_STATUS = new Set([502, 503, 504])
const LOCAL_API_FALLBACK = 'http://localhost:8000'

// OLA2-M3: fail-fast en producción. Un build de prod sin VITE_API_URL apuntaría
// en silencio a localhost (app rota sin error visible). En dev/test se mantiene
// el fallback local. `env` inyectable para unit tests (por defecto import.meta.env).
export function getApiBase(env = import.meta.env) {
  const url = env?.VITE_API_URL
  if (!url && env?.PROD) {
    throw new Error('VITE_API_URL no definida en producción (fail-fast OLA2-M3)')
  }
  return url || LOCAL_API_FALLBACK
}

export function isRetryableError(err) {
  if (isCancelError(err)) return false // OLA4: un abort nunca se reintenta
  const status = err?.response?.status
  if (status != null) return RETRYABLE_STATUS.has(status)
  // Sin respuesta: timeout, red caída, cold start Render.
  return true
}

// OLA4: peticiones abortadas vía AbortController (axios las rechaza con ERR_CANCELED).
export function isCancelError(err) {
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError'
}

export function retryDelayMs(attempt) {
  // attempt 0 -> 2s, 1 -> 4s. Tope 5s.
  return Math.min(5000, 2000 * 2 ** attempt)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- Detector lentitud (transparente si responde rápido) ---
let pendingCount = 0
let slowTimer = null
let slowActive = false

function emitSlow(name) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(name))
    }
  } catch {
    // noop: SSR/tests sin window
  }
}

function trackStart() {
  pendingCount += 1
  if (pendingCount === 1 && slowTimer == null && typeof window !== 'undefined') {
    slowTimer = setTimeout(() => {
      slowTimer = null
      slowActive = true
      emitSlow('alojau:api-slow-start')
    }, API_SLOW_THRESHOLD_MS)
  }
}

function trackEnd() {
  pendingCount = Math.max(0, pendingCount - 1)
  if (pendingCount === 0) {
    if (slowTimer != null) {
      clearTimeout(slowTimer)
      slowTimer = null
    }
    if (slowActive) {
      slowActive = false
      emitSlow('alojau:api-slow-end')
    }
  }
}

export function __resetApiTrackerForTests() {
  pendingCount = 0
  if (slowTimer != null) {
    clearTimeout(slowTimer)
    slowTimer = null
  }
  slowActive = false
}

export const api = axios.create({
  baseURL: getApiBase(),
  timeout: API_TIMEOUT_MS,
})

api.interceptors.request.use((cfg) => {
  cfg.__retryCount = cfg.__retryCount ?? 0
  trackStart()
  return cfg
})

api.interceptors.response.use(
  (res) => {
    trackEnd()
    return res
  },
  async (err) => {
    const cfg = err.config
    if (!cfg) {
      trackEnd()
      throw err
    }
    const canRetry = (cfg.__retryCount ?? 0) < API_MAX_RETRIES && isRetryableError(err)
    if (!canRetry) {
      trackEnd()
      throw err
    }
    const attempt = cfg.__retryCount ?? 0
    cfg.__retryCount = attempt + 1
    // Libera el conteo del intento fallido antes de esperar, el reintento vuelve a contar.
    trackEnd()
    await sleep(retryDelayMs(attempt))
    return api(cfg)
  },
)
