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
