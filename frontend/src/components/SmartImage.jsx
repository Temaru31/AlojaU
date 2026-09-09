// SmartImage - imagen con reintentos, fallback local y aspect estable.
// Uso: <SmartImage src alt className eager /> en Card/Galeria/Visor. Ej: <SmartImage src={url} alt="Foto 1" />.
import { useState } from 'react'

export const FALLBACK_IMG = '/fallback-foto.svg'
const MAX_ATTEMPTS = 3

export function normalizeImgUrl(url) {
  // Unsplash sin auto=format falla en burst: añade params estándar una sola vez.
  if (typeof url !== 'string' || !url.includes('images.unsplash.com')) return url
  if (url.includes('auto=format')) return url
  return url.includes('?') ? `${url}&auto=format&q=80` : `${url}?auto=format&q=80`
}

export default function SmartImage({ src, alt = '', className = '', eager = false, onClick }) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={`bg-neutral-100 flex items-center justify-center ${className}`} role="img" aria-label={alt || 'Sin foto'}>
        <img src={FALLBACK_IMG} alt="" aria-hidden="true" className="w-1/2 h-1/2 object-contain opacity-70" loading="lazy" decoding="async" />
      </div>
    )
  }

  const currentSrc = attempt === 0 ? normalizeImgUrl(src) : `${normalizeImgUrl(src)}${src.includes('?') ? '&' : '?'}retry=${attempt}`

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={`${className} bg-neutral-100 transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      fetchPriority={eager ? 'high' : undefined}
      onLoad={() => setLoaded(true)}
      onClick={onClick}
      onError={(e) => {
        e.currentTarget.onerror = null
        if (attempt + 1 < MAX_ATTEMPTS) {
          setAttempt((a) => a + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
