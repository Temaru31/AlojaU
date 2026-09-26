// BotonCompartir — Compartir nativo con fallback honesto.
// En móvil usa navigator.share (hoja del sistema: WhatsApp, redes…); en
// desktop (o sin share) copia el enlace al portapapeles y confirma con toast
// "Enlace copiado al portapapeles". Nunca finge haber compartido.
// Uso: <BotonCompartir titulo="Aviso" url="https://…" etiqueta="Compartir aviso" />
import { useState } from 'react'
import { notifyToast } from './Toast'

export async function compartirEnlace({ titulo, url }) {
  const texto = String(titulo || 'AlojaU')
  const enlace = String(url || (typeof window !== 'undefined' ? window.location.href : ''))
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: texto, url: enlace })
      return 'compartido'
    }
  } catch {
    // Cancelado por el usuario o share fallido: cae al portapapeles.
  }
  try {
    await navigator.clipboard.writeText(enlace)
    notifyToast('Enlace copiado al portapapeles')
    return 'copiado'
  } catch {
    return 'fallo'
  }
}

export default function BotonCompartir({ titulo, url, etiqueta = 'Compartir', className = '' }) {
  const [estado, setEstado] = useState('idle')
  const alClic = async () => {
    setEstado('trabajando')
    const r = await compartirEnlace({ titulo, url })
    setEstado(r === 'fallo' ? 'error' : 'idle')
  }
  return (
    <button
      type="button"
      onClick={alClic}
      disabled={estado === 'trabajando'}
      aria-label={etiqueta}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 bg-white border-neutral-200 text-neutral-600 hover:border-navy-300 hover:text-navy-700 disabled:opacity-50 ${className}`}
    >
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
      {estado === 'trabajando' ? '…' : estado === 'error' ? 'Reintentar' : etiqueta}
    </button>
  )
}
