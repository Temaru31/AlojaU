export const formatCOP = (n) => n?.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
// Tarea 2 (v10): precisión peatonal — tortuosidad urbana y velocidad (~4 km/h).
export const PEATONAL_FACTOR = 1.28
export const VELOCIDAD_M_MIN = 66
export const formatDistancia = (m) => {
  if (m == null || isNaN(Number(m))) return 'No informado'
  const num = Number(m)
  return num < 1000 ? `${num.toLocaleString('es-CO')} m` : `${(num / 1000).toFixed(1)} km`
}
export const getColorIndice = (i) => i >= 80 ? 'emerald' : i >= 50 ? 'orange' : 'red'
export const getLabelIndice = (i) => i >= 80 ? 'Alto' : i >= 50 ? 'Medio' : 'Básico'
export const formatTiempoCaminando = (m) => {
  if (m == null || isNaN(Number(m))) return null
  const num = Number(m)
  // Tarea 2 (v10): tortuosidad urbana 1.28 (la manzana real es ~28% más larga
  // que la recta) y 66 m/min (~4 km/h urbano). Fuente única frontend del
  // "Y min a pie" (backend: services/haversine.tiempo_pie_min, mismos valores).
  const peatonal = num * PEATONAL_FACTOR
  if (peatonal < VELOCIDAD_M_MIN) return '<1 min a pie'
  const mins = Math.max(1, Math.round(peatonal / VELOCIDAD_M_MIN))
  if (mins < 60) return `~${mins} min a pie`
  const h = Math.floor(mins / 60); const rem = mins % 60
  return rem ? `~${h}h ${rem}min a pie` : `~${h}h a pie`
}
/** Distancia peatonal estimada (Haversine × 1.28), formateada como distancia. */
export const formatDistanciaPeatonal = (m) => {
  if (m == null || isNaN(Number(m))) return 'No informado'
  return formatDistancia(Number(m) * PEATONAL_FACTOR)
}
export const formatDistanciaConTiempo = (m) => {
  if (m == null || isNaN(Number(m))) return 'No informado'
  const d = formatDistancia(m)
  const t = formatTiempoCaminando(m)
  return t ? `${d} • ${t}` : d
}
