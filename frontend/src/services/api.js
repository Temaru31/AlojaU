// Cliente Axios - HU-001/002/003 + UX cold-start Render.
// Retry con backoff para cold start 30-50s + eventos lentitud para banner discreto.
// Uso: import { api } from './services/api'. Ej: api.get('/api/campus') reintenta 503/timeout solo.
import axios from 'axios'

export const API_TIMEOUT_MS = 55000
export const API_MAX_RETRIES = 2
export const API_SLOW_THRESHOLD_MS = 4000
const RETRYABLE_STATUS = new Set([502, 503, 504])

export function isRetryableError(err) {
  const status = err?.response?.status
  if (status != null) return RETRYABLE_STATUS.has(status)
  // Sin respuesta: timeout, red caída, cold start Render.
  return true
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
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
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
