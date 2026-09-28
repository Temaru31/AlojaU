// useKeepAlive — Bloque 3: mitiga el cold start de Render Free.
//
// El plan gratuito suspende el backend tras inactividad; el primer request
// tarda 15-45s. Este hook envía un ping ligero `GET /health` cada 11 min
// ÚNICAMENTE mientras la pestaña está visible (`visibilityState`).
// No se exige foco de ventana (hasFocus): con la pestaña visible basta;
// exigir foco impediría el ping con devtools o split-screen activos.
// (`document.visibilityState === 'visible'`). No usa setInterval ciego:
// - No pingeja en background (ahorra cuota y batería).
// - Reanuda al volver a visible si pasaron >10 min.
// Uso: useKeepAlive() una vez en App (debajo de los providers).
import { useEffect, useRef } from 'react'
import { api } from '../services/api'

export const KEEPALIVE_INTERVAL_MS = 11 * 60_000 // 11 min (ventana pedida 10-12)
export const KEEPALIVE_MIN_GAP_MS = 10 * 60_000

export default function useKeepAlive({ intervalMs = KEEPALIVE_INTERVAL_MS } = {}) {
  const ultimoPing = useRef(0)

  useEffect(() => {
    let vivo = true
    let timer = null

    const debePing = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
      } catch { /* SSR: ping igual */ }
      return Date.now() - ultimoPing.current >= KEEPALIVE_MIN_GAP_MS
    }

    const ping = async () => {
      if (!vivo || !debePing()) return
      ultimoPing.current = Date.now()
      try {
        // /health es liviano (sin DB) para despertar sin cargar el pool.
        await api.get('/health', { timeout: 15000 })
      } catch {
        // Silencioso: el banner ColdStart + retry de api.js ya avisan.
      }
    }

    // Primer ping diferido (no compite con la carga inicial).
    timer = setInterval(ping, intervalMs)

    const alVisibilidad = () => {
      try {
        if (document.visibilityState === 'visible') ping()
      } catch { /* noop */ }
    }
    try {
      document.addEventListener('visibilitychange', alVisibilidad)
    } catch { /* SSR/tests */ }

    return () => {
      vivo = false
      if (timer) clearInterval(timer)
      try {
        document.removeEventListener('visibilitychange', alVisibilidad)
      } catch { /* noop */ }
    }
  }, [intervalMs])
}
