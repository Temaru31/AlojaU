// Reglas puras del formulario de publicación: borrador local, formato COP y validación.
import { LIMITES } from '../constants'
import { esHttpUrl } from './urls'
import { CookingPot, ShowerHead, Sofa, Sparkles, WashingMachine, Wifi } from 'lucide-react'

/** Clave del borrador local (persistencia ante recargas / cold start). */
export const DRAFT_KEY = 'alojau_publicar_draft'

const ICONOS_SERVICIOS = {
  1: Wifi,
  2: ShowerHead,
  3: CookingPot,
  4: Sofa,
  5: WashingMachine,
}

export function iconoServicio(id, nombre) {
  if (ICONOS_SERVICIOS[id]) return ICONOS_SERVICIOS[id]
  const n = String(nombre || '').toLowerCase()
  if (n.includes('wifi') || n.includes('internet')) return Wifi
  if (n.includes('baño')) return ShowerHead
  if (n.includes('amobl')) return Sofa
  if (n.includes('cocina')) return CookingPot
  if (n.includes('lavad')) return WashingMachine
  return Sparkles
}

/**
 * Sanitización anti-XSS/SQLi en cliente (defensa en profundidad; el backend
 * rechaza `<`/`>` con 422 y usa ORM parametrizado). Elimina < > y recorta.
 */
export function sanitizarTexto(s, max = 2000) {
  if (s == null) return ''
  return String(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Formatea canon en tiempo real: 450000 -> "$ 450.000". */
export function formatearCOP(valor) {
  const n = Number(String(valor ?? '').replace(/[^\d]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return ''
  return `$ ${n.toLocaleString('es-CO')}`
}

/** Solo dígitos (para guardar en el payload). */
export function soloDigitos(valor) {
  return String(valor ?? '').replace(/[^\d]/g, '')
}

export function leerBorrador() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    return p
  } catch {
    return null
  }
}

export function guardarBorrador(form) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, _ts: Date.now() }))
  } catch { /* cuota llena: no rompe el form */ }
}

export function limpiarBorrador() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
}

/**
 * Valida el formulario de publicar contra LIMITES (fuente única de verdad).
 * @param {object} form Estado del formulario (mismas claves que Publicar).
 * @param {object} [lim=LIMITES] Límites inyectables (tests alteran el límite).
 * @returns {object} Mapa campo->mensaje (vacío = válido).
 */
export function validarPublicar(form, lim = LIMITES) {
  const e = {}
  const t = (form.titulo || '').trim()
  if (t.length < lim.titulo.min) e.titulo = `Mínimo ${lim.titulo.min} caracteres`
  else if ((form.titulo || '').length > lim.titulo.max) e.titulo = `Máximo ${lim.titulo.max} caracteres`
  const d = (form.descripcion || '').trim()
  if (d.length < lim.descripcion.min) e.descripcion = `Mínimo ${lim.descripcion.min} caracteres`
  else if ((form.descripcion || '').length > lim.descripcion.max) e.descripcion = `Máximo ${lim.descripcion.max} caracteres`
  if (!form.canon_mensual || Number(form.canon_mensual) <= 0) e.canon_mensual = 'Canon > 0'
  else if (Number(form.canon_mensual) > lim.canonMax) e.canon_mensual = `Máximo ${lim.canonMax / 1_000_000}M`
  if (form.deposito_requerido === '' || Number(form.deposito_requerido) < 0) e.deposito_requerido = 'Depósito >=0'
  const dir = (form.direccion_referencial || '').trim()
  if (dir.length < lim.direccion.min) e.direccion_referencial = `Mínimo ${lim.direccion.min} caracteres`
  else if ((form.direccion_referencial || '').length > lim.direccion.max) e.direccion_referencial = `Máximo ${lim.direccion.max} caracteres`
  const reg = (form.reglas_convivencia || '').trim()
  if (reg.length < lim.reglas.min) e.reglas_convivencia = `Mínimo ${lim.reglas.min} caracteres`
  else if ((form.reglas_convivencia || '').length > lim.reglas.max) e.reglas_convivencia = `Máximo ${lim.reglas.max} caracteres`
  if (!Array.isArray(form.servicios_ids) || form.servicios_ids.length === 0) e.servicios_ids = 'Selecciona al menos 1 servicio'
  // Zona del catálogo o barrio libre (mínimo uno).
  if (form.zona_barrio_id == null && !(form.barrio_texto || '').trim()) {
    e.zona = 'Elige tu barrio de la lista o escríbelo'
  }
  const fotosValid = (form.fotos || []).filter((f) => (f || '').trim() !== '')
  if (fotosValid.length < lim.fotosMin) e.fotos = `Mínimo ${lim.fotosMin} fotos (sube fotos reales)`
  else {
    for (const url of fotosValid) {
      // Validación estricta (CodeQL): protocolo http/https real, nunca
      // substring-match (aceptaba `http:evil` o `httpx://...`).
      if (!esHttpUrl(url)) { e.fotos = 'URLs deben ser http(s) válidas'; break }
    }
  }
  if (form.latitud !== '' && form.latitud != null && (isNaN(Number(form.latitud)) || Number(form.latitud) < -90 || Number(form.latitud) > 90)) e.latitud = 'Latitud entre -90 y 90'
  if (form.longitud !== '' && form.longitud != null && (isNaN(Number(form.longitud)) || Number(form.longitud) < -180 || Number(form.longitud) > 180)) e.longitud = 'Longitud entre -180 y 180'
  return e
}

// Cuerpo del POST /api/publicaciones a partir del formulario. Sanea los textos
// (defensa en profundidad: el backend también valida y rechaza HTML).
export function armarPayloadPublicacion(form, lim = LIMITES) {
  return {
    titulo: sanitizarTexto(form.titulo, lim.titulo.max),
    descripcion: sanitizarTexto(form.descripcion, lim.descripcion.max),
    tipo_inmueble: form.tipo_inmueble,
    canon_mensual: Number(soloDigitos(form.canon_mensual) || form.canon_mensual),
    deposito_requerido: Number(soloDigitos(form.deposito_requerido) || 0),
    zona_barrio_id: form.zona_barrio_id != null ? Number(form.zona_barrio_id) : null,
    barrio_texto: sanitizarTexto(form.barrio_texto || '', 120) || null,
    direccion_referencial: sanitizarTexto(form.direccion_referencial, lim.direccion.max),
    reglas_convivencia: sanitizarTexto(form.reglas_convivencia, lim.reglas.max),
    latitud: form.latitud === '' ? null : Number(form.latitud),
    longitud: form.longitud === '' ? null : Number(form.longitud),
    servicios_ids: form.servicios_ids,
    campus_ids: [],
    fotos: form.fotos.filter(f => f.trim() !== ''),
  }
}

export const FORM_INICIAL = {
  titulo: '',
  descripcion: '',
  tipo_inmueble: 'HABITACION_INDEPENDIENTE',
  canon_mensual: '',
  deposito_requerido: '0',
  zona_barrio_id: 3,
  barrio_texto: null,
  direccion_referencial: '',
  reglas_convivencia: '',
  latitud: '',
  longitud: '',
  servicios_ids: [1],
  campus_ids: [],
  // Sin fotos de ejemplo: el usuario sube las suyas (3-10) y el preview
  // muestra un placeholder hasta entonces. Las URLs de ejemplo (unsplash)
  // confundían y podían publicarse por accidente.
  fotos: [],
}

export function mezclarBorrador(base, draft) {
  if (!draft) return base
  const out = { ...base }
  for (const k of Object.keys(base)) {
    if (draft[k] !== undefined) out[k] = draft[k]
  }
  // Higiene: borradores viejos podían traer fotos de ejemplo (unsplash);
  // se descartan para no publicar fotos ajenas por accidente.
  if (Array.isArray(out.fotos)) {
    out.fotos = out.fotos.filter((u) => u && !esFotoEjemplo(u))
  }
  return out
}

// Foto de ejemplo/placeholder: solo si el HOST parseado es de Unsplash
// (comparación exacta + sufijo, nunca subcadena: evita falsos positivos
// como https://evil.com/?x=images.unsplash.com). Sin esquema se asume
// https para el parseo (conserva el filtrado legacy de borradores viejos).
export function esFotoEjemplo(url) {
  try {
    const texto = String(url || '').trim()
    const normalizada = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`
    const host = new URL(normalizada).hostname.toLowerCase()
    return host === 'images.unsplash.com' || host.endsWith('.unsplash.com')
  } catch {
    return false
  }
}
