// sesion.js — Presentación amigable de sesiones activas (M2).
// Fecha ISO/24h -> "23 Sep 2026, 10:14 PM" y User-Agent crudo ->
// "Chrome en Windows". Sin dependencias, con fallbacks seguros.

const MESES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/**
 * Formatea una fecha ISO a "23 Sep 2026, 10:14 PM" (12h, hora de Bogotá).
 * @param {string|null} iso Fecha ISO o null.
 * @returns {string|null} Texto legible o null si no parseable.
 */
export function formatearSesionFecha(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    const partes = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(d)
    const get = (t) => partes.find((p) => p.type === t)?.value
    const mes = MESES_ES[Number(get('month')) - 1]
    let h = Number(get('hour'))
    if (h === 0) h = 12
    const sufijo = String(get('dayPeriod') || '').toLowerCase().includes('p') ? 'PM' : 'AM'
    return `${get('day')} ${mes} ${get('year')}, ${h}:${get('minute')} ${sufijo}`
  } catch {
    return null
  }
}

/**
 * Reduce un User-Agent a "Navegador en Sistema".
 * @param {string|null} ua User-Agent crudo o null.
 * @returns {string} Etiqueta amigable o "Dispositivo desconocido".
 */
export function etiquetaDispositivo(ua) {
  if (!ua || typeof ua !== 'string') return 'Dispositivo desconocido'
  if (ua.trim().toLowerCase() === 'mock') return 'Este dispositivo (demo)'
  const u = ua.toLowerCase()
  let sistema = null
  if (u.includes('iphone')) sistema = 'iPhone'
  else if (u.includes('ipad')) sistema = 'iPad'
  else if (u.includes('android')) sistema = 'Android'
  else if (u.includes('windows')) sistema = 'Windows'
  else if (u.includes('mac os') || u.includes('macintosh')) sistema = 'macOS'
  else if (u.includes('linux')) sistema = 'Linux'
  let navegador = null
  if (u.includes('edg/') || u.includes('edge/') || u.includes('edgios/')) navegador = 'Edge'
  else if (u.includes('opr/') || u.includes('opera')) navegador = 'Opera'
  else if (u.includes('crios/')) navegador = 'Chrome'
  else if (u.includes('fxios/')) navegador = 'Firefox'
  else if (u.includes('chrome/') && !u.includes('chromium')) navegador = 'Chrome'
  else if (u.includes('firefox/')) navegador = 'Firefox'
  else if (u.includes('safari/') && u.includes('version/')) navegador = 'Safari'
  if (navegador && sistema) return `${navegador} en ${sistema}`
  if (navegador) return navegador
  if (sistema) return sistema
  return 'Dispositivo desconocido'
}
