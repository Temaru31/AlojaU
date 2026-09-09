export const formatCOP = (n) => n?.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
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
  if (num < 80) return '<1 min a pie'
  const mins = Math.max(1, Math.round(num / 80))
  if (mins < 60) return `~${mins} min a pie`
  const h = Math.floor(mins / 60); const rem = mins % 60
  return rem ? `~${h}h ${rem}min a pie` : `~${h}h a pie`
}
export const formatDistanciaConTiempo = (m) => {
  if (m == null || isNaN(Number(m))) return 'No informado'
  const d = formatDistancia(m)
  const t = formatTiempoCaminando(m)
  return t ? `${d} • ${t}` : d
}
