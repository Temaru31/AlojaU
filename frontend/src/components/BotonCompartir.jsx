// BotonCompartir — Compartir nativo con fallback honesto.
// En móvil usa navigator.share (hoja del sistema: WhatsApp, redes…); en
// desktop (o sin share) copia el enlace al portapapeles y confirma con toast
// "Enlace copiado al portapapeles". Nunca finge haber compartido.
// Uso: <BotonCompartir titulo="Aviso" url="https://…" etiqueta="Compartir aviso" />
import { useState } from 'react'
import Icono from './Icono'
import { notifyToast } from './Toast'

export async function compartirEnlace({ titulo, texto, url }) {
  const nombre = String(titulo || 'AlojaU')
  const enlace = String(url || (typeof window !== 'undefined' ? window.location.href : ''))
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share(
        texto ? { title: nombre, text: String(texto), url: enlace } : { title: nombre, url: enlace },
      )
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

// `variante="flotante"`: circular oscuro para fotos (mismo lenguaje que los
// flotantes de fav/comparar: bg-black/60 + borde blanco/20 + blur).
// `variante="pastilla"` (default): píldora clara para filas de acciones.
export default function BotonCompartir({ titulo, texto, url, etiqueta = 'Compartir', variante = 'pastilla', className = '' }) {
  const [estado, setEstado] = useState('idle')
  const alClic = async () => {
    setEstado('trabajando')
    const r = await compartirEnlace({ titulo, texto, url })
    setEstado(r === 'fallo' ? 'error' : 'idle')
  }
  if (variante === 'flotante') {
    return (
      <button
        type="button"
        onClick={alClic}
        disabled={estado === 'trabajando'}
        aria-label={etiqueta}
        title={etiqueta}
        className={`w-11 h-11 rounded-full text-white flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition disabled:opacity-50 bg-black/60 ${className}`}
      >
        <Icono nombre="compartir" className="w-5 h-5" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={alClic}
      disabled={estado === 'trabajando'}
      aria-label={etiqueta}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 bg-white border-neutral-200 text-neutral-600 hover:border-navy-300 hover:text-navy-700 disabled:opacity-50 ${className}`}
    >
      <Icono nombre="compartir" className="w-4 h-4" />
      {estado === 'trabajando' ? '…' : estado === 'error' ? 'Reintentar' : etiqueta}
    </button>
  )
}
