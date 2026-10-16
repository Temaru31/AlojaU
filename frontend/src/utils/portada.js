// portada.js — Fuente única para la foto de portada (BUG#1).
// La portada es orden=1: si el payload trae `imagenes[{id,url,orden}]` se usa
// la de menor orden; si no, fotos[0] (la API ya la devuelve ordenada).
// Uso: Card, Favoritos, Comparar, MisPublicaciones, GaleriaFotos, Detalle.

export function imagenesOrdenadas(pub) {
  const imgs = pub?.imagenes
  if (!Array.isArray(imgs) || imgs.length === 0) return []
  return [...imgs].sort((a, b) => (a?.orden ?? 0) - (b?.orden ?? 0))
}

export function portadaUrl(pub) {
  const imgs = imagenesOrdenadas(pub)
  if (imgs.length > 0 && imgs[0]?.url) return imgs[0].url
  const fotos = pub?.fotos
  if (Array.isArray(fotos) && fotos.length > 0) {
    const f0 = fotos[0]
    if (typeof f0 === 'string') return f0
    if (f0?.url) return f0.url
  }
  return null
}

export function fotosOrdenadas(pub) {
  // Para galerías: si hay imagenes con orden, mandan; si no, fotos tal cual
  // (la API ya las trae ordenadas por portada primero).
  const imgs = imagenesOrdenadas(pub)
  if (imgs.length > 0) return imgs.map((i) => i.url).filter(Boolean)
  const fotos = pub?.fotos
  if (!Array.isArray(fotos)) return []
  return fotos.map((f) => (typeof f === 'string' ? f : f?.url)).filter(Boolean)
}

// ficha.js embebida (fuente única de texto derivado del payload):
// el backend responde formas mixtas (canon_mensual/canon, zona_nombre/zona/
// barrio_texto, fotos[]/num_fotos/imagenes[], deposito_requerido/deposito,
// distancia_geodesica_m/dist_m). Centralizar evita "NaN COP/mes" y
// "No informado" falsos cuando el aviso solo trae barrio libre.

/** "$480.000 COP/mes" o null si no hay canon válido. */
export function canonTexto(pub) {
  const n = Number(pub?.canon_mensual ?? pub?.canon)
  if (!Number.isFinite(n) || n <= 0) return null
  return `$${n.toLocaleString('es-CO')} COP/mes`
}

/** Zona legible (incluye barrio libre) o null. */
export function zonaTextoDe(pub) {
  return pub?.zona_nombre || pub?.zona || pub?.barrio_texto || null
}

/** Nº de fotos cualesquiera que sea la forma del payload. */
export function numFotosDe(pub) {
  if (Array.isArray(pub?.fotos)) return pub.fotos.length
  if (typeof pub?.fotos === 'number') return pub.fotos
  if (typeof pub?.num_fotos === 'number') return pub.num_fotos
  return fotosOrdenadas(pub).length
}
