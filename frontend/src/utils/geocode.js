/**
 * geocode.js — caché local + Nominatim ligero (Oleada 2, costo-cero).
 *
 * Reglas: throttle 1 req/s global (política Nominatim), caché 30 días en
 * localStorage, jamás lanza (retorna null y el usuario digita manual).
 * Nota: desde el navegador no se puede fijar `User-Agent` (prohibido por
 * la spec Fetch); el `Referer` del sitio identifica la app.
 */

const REVERSE_KEY = 'alojau_geocode_reverse_v1'
const CACHE_DIAS = 30
let ultimaPeticion = 0

function leerCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REVERSE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function claveReverse(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

export function getDireccionCacheada(lat, lng) {
  const cache = leerCache()
  const item = cache[claveReverse(lat, lng)]
  if (!item) return null
  const expira = item.ts + CACHE_DIAS * 24 * 3600 * 1000
  if (Date.now() > expira) return null
  return item.direccion || null
}

export function setDireccionCacheada(lat, lng, direccion) {
  try {
    const cache = leerCache()
    cache[claveReverse(lat, lng)] = { direccion, ts: Date.now() }
    const claves = Object.keys(cache).slice(-200)
    const recortada = {}
    for (const k of claves) recortada[k] = cache[k]
    localStorage.setItem(REVERSE_KEY, JSON.stringify(recortada))
  } catch { /* storage lleno/bloqueado: el mapa sigue funcionando */ }
}

export async function reverseGeocode(lat, lng) {
  const cacheada = getDireccionCacheada(lat, lng)
  if (cacheada) return cacheada
  // Throttle 1 req/s global.
  const ahora = Date.now()
  const espera = 1100 - (ahora - ultimaPeticion)
  if (espera > 0) await new Promise(r => window.setTimeout(r, espera))
  ultimaPeticion = Date.now()
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=17&addressdetails=0&accept-language=es`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const direccion = data?.display_name || null
    if (direccion) setDireccionCacheada(lat, lng, direccion)
    return direccion
  } catch {
    return null
  }
}
