// constants.js — Fuente única de verdad para límites de validación (v15.2).
// Los mismos valores viven en el backend (schemas + system_settings).
// Si el backend cambia un límite, actualízalo aquí para que los contadores
// y maxLength sigan sincronizados. Uso:
//   import { LIMITES, estadoRango, haceRelativo } from '../constants'

export const LIMITES = {
  titulo: { min: 10, max: 150 },
  descripcion: { min: 20, max: 2000 },
  direccion: { min: 10, max: 200 },
  reglas: { min: 10, max: 2000 },
  bio: { min: 0, max: 500 },
  canonMax: 10_000_000,
  fotosMin: 3,
  fotosMax: 10,
  // Badge "Desactualizada" (derivado en cliente; ver dias_desactualizada).
  desactualizadaDias: 30,
}

// Estado visual de un input con mínimo/máximo: ok|cerca|mal.
export function estadoRango(len, min, max) {
  if (len < min) return 'mal'
  if (max != null && len > max * 0.9) return 'cerca'
  return 'ok'
}

export const RANGO_CLS = {
  ok: 'border-emerald-300 focus:border-emerald-400',
  cerca: 'border-amber-300 focus:border-amber-400',
  mal: 'border-red-300 focus:border-red-400',
}

// Fecha relativa en español: "hoy", "hace 3 días", "hace 2 h".
export function haceRelativo(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000))
  if (mins < 60) return mins <= 1 ? 'hace un momento' : `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return horas === 1 ? 'hace 1 h' : `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'hace 1 día'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`
  return `hace ${Math.floor(meses / 12)} año(s)`
}

// ¿Supera la frescura configurada? (badge "Desactualizada" derivado).
export function estaDesactualizada(fechaRenovacion, diasLimite = LIMITES.desactualizadaDias) {
  if (!fechaRenovacion) return false
  const t = new Date(fechaRenovacion).getTime()
  if (Number.isNaN(t)) return false
  return (Date.now() - t) / 86_400_000 > diasLimite
}

// Detalle #3: config pública del backend (GET /api/publicaciones/config-publica).
// El endpoint es público y barato (1 query); aquí se lee UNA vez por sesión y
// se cachea en memoria + localStorage (TTL 5 min). Si falla o no hay red, se
// usa LIMITES local (divergencia aceptada y documentada).
const _CFG_KEY = 'alojau_config_publica'
const _CFG_TTL_MS = 5 * 60_000
let _cfgMem = null
let _cfgTs = 0

export function leerConfigCache() {
  if (_cfgMem && Date.now() - _cfgTs < _CFG_TTL_MS) return _cfgMem
  try {
    const raw = localStorage.getItem(_CFG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Date.now() - (parsed.ts || 0) < _CFG_TTL_MS) {
      _cfgMem = parsed.cfg
      _cfgTs = parsed.ts
      return _cfgMem
    }
  } catch { /* sin caché: fallback a LIMITES */ }
  return null
}

export async function fetchConfigPublica(getter) {
  const hit = leerConfigCache()
  if (hit) return hit
  try {
    const data = getter
      ? await getter()
      : await (await fetch('/api/publicaciones/config-publica')).json()
    if (data && typeof data === 'object') {
      _cfgMem = data
      _cfgTs = Date.now()
      try { localStorage.setItem(_CFG_KEY, JSON.stringify({ cfg: data, ts: _cfgTs })) } catch { /* noop */ }
      return data
    }
  } catch { /* fallback a LIMITES */ }
  return null
}

export function diasDesactualizadaEfectiva() {
  const cfg = leerConfigCache()
  const v = Number(cfg?.dias_desactualizada)
  return Number.isFinite(v) && v >= 1 && v <= 365 ? v : LIMITES.desactualizadaDias
}

export function limpiarConfigCache() {
  _cfgMem = null
  _cfgTs = 0
  try { localStorage.removeItem(_CFG_KEY) } catch { /* noop */ }
}
