/**
 * Compresión de imágenes en cliente vía Canvas (Tarea 4, v4).
 * Reduce fotos pesadas a máx 1200px de ancho, calidad 0.8 (WEBP si el
 * navegador lo soporta, JPEG si no). Ante cualquier fallo (jsdom, formato
 * raro, canvas sin 2d) retorna el archivo ORIGINAL: nunca rompe la subida.
 * Uso: const liviano = await comprimirImagen(file). Ej: 4MB -> ~300KB.
 */

export const COMPRESS_MAX_WIDTH = 1200
export const COMPRESS_QUALITY = 0.8
export const COMPRESS_MIN_BYTES = 300 * 1024 // <300KB no vale la pena recomprimir

function pintar(canvas, bitmap, w, h) {
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(bitmap, 0, 0, w, h)
  return true
}

function aBlob(canvas, tipo, quality) {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob !== 'function') return resolve(null)
      canvas.toBlob((b) => resolve(b), tipo, quality)
    } catch {
      resolve(null)
    }
  })
}

export async function comprimirImagen(file, { maxWidth = COMPRESS_MAX_WIDTH, quality = COMPRESS_QUALITY } = {}) {
  try {
    if (!file || !file.type || !file.type.startsWith('image/')) return file
    if (typeof createImageBitmap !== 'function') return file
    const bitmap = await createImageBitmap(file)
    try {
      const escala = Math.min(1, maxWidth / (bitmap.width || maxWidth))
      const yaLiviana = file.size <= COMPRESS_MIN_BYTES && escala >= 1
      if (yaLiviana) return file
      const w = Math.max(1, Math.round(bitmap.width * escala))
      const h = Math.max(1, Math.round(bitmap.height * escala))
      const canvas = document.createElement('canvas')
      if (!pintar(canvas, bitmap, w, h)) return file
      // Prefiere WEBP; si el navegador no lo soporta (blob null), cae a JPEG.
      let blob = await aBlob(canvas, 'image/webp', quality)
      let ext = 'webp'
      let mime = 'image/webp'
      if (!blob) {
        blob = await aBlob(canvas, 'image/jpeg', quality)
        ext = 'jpg'
        mime = 'image/jpeg'
      }
      if (!blob) return file
      // Si no ahorra nada, conserva la original.
      if (blob.size >= file.size) return file
      const base = (file.name || 'foto').replace(/\.[a-z0-9]+$/i, '')
      return new File([blob], `${base}.${ext}`, { type: mime })
    } finally {
      try { bitmap.close?.() } catch { /* noop */ }
    }
  } catch {
    return file
  }
}
