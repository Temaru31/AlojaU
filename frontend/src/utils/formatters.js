export const formatCOP = (n) => n?.toLocaleString('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})
export const formatDistancia = (m) => m < 1000 ? `${m} m` : `${(m/1000).toFixed(1)} km`
export const getColorIndice = (i) => i>=80?'green':i>=50?'yellow':'orange'
export const getLabelIndice = (i) => i>=80?'Alto':i>=50?'Medio':'Básico'
// Tiempo caminando realista: basado en distancia Haversine, velocidad 4.8 km/h (80 m/min), sin ruteo
// No inventa calles, solo estima: tiempo = distancia / 80, mínimo 1 min, máximo redondeado
export const formatTiempoCaminando = (m) => {
  if(m == null || isNaN(m)) return null
  const mins = Math.max(1, Math.round(m / 80))
  if(mins < 60) return `~${mins} min a pie`
  const h = Math.floor(mins/60); const rem = mins%60
  return rem ? `~${h}h ${rem}min a pie` : `~${h}h a pie`
}
export const formatDistanciaConTiempo = (m) => {
  if(m == null) return '—'
  const d = formatDistancia(m)
  const t = formatTiempoCaminando(m)
  return t ? `${d} • ${t}` : d
}
