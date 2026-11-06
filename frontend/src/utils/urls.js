// urls.js — Fuente única de validación URL (seguridad).
// Regla: NUNCA decidir con substring (`includes`, `startsWith('http')`):
// `http:evil`, `httpx://...` o `...?x=images.unsplash.com` lo burlan.
// Se parsea con URL y se compara protocolo/host exactos.
export function esHttpUrl(valor) {
  if (typeof valor !== 'string') return false
  try {
    const u = new URL(valor.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Host en minúsculas o '' si no parsea (para allowlists exactas). */
export function hostDe(url) {
  if (typeof url !== 'string') return ''
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
}
