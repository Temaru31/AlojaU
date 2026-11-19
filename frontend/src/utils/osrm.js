/**
 * Ruta peatonal real vía OSRM Foot API (progresivo, con fallback local).
 * Si OSRM responde rápido (<4s) devuelve { distM, mins } por red de calles;
 * ante cualquier fallo (red, timeout, respuesta inválida) retorna null y el
 * llamador conserva la estimación por fórmula (Haversine × 1.28 / 66 m/min).
 * Sin API key ni cuotas. Uso: MapaZona en modo trayectoria.
 */

const OSRM_URL = 'https://router.project-osrm.org/route/v1/foot'
export const OSRM_TIMEOUT_MS = 4000

export async function obtenerRutaPie(
  { origen, destino },
  { timeoutMs = OSRM_TIMEOUT_MS, signal: externalSignal } = {},
) {
  const coordsOk = (p) =>
    p != null && p.lat !== '' && p.lng !== '' &&
    !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng))
  if (!coordsOk(origen) || !coordsOk(destino)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer)
      return null
    }
    externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    const url = `${OSRM_URL}/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=false`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    const data = await r.json()
    const ruta = data?.routes?.[0]
    if (ruta == null || ruta.distance == null || ruta.duration == null) return null
    return {
      distM: Math.round(ruta.distance),
      mins: Math.max(1, Math.round(ruta.duration / 60)),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
