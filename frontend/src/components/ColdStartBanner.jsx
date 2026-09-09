// Banner discreto cold-start Render (30-50s por inactividad).
// Uso: <ColdStartBanner /> entre Nav y main. Ej: visible solo si un request supera 4s.
import { useEffect, useState } from 'react'

export default function ColdStartBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    const hide = () => setVisible(false)
    window.addEventListener('alojau:api-slow-start', show)
    window.addEventListener('alojau:api-slow-end', hide)
    return () => {
      window.removeEventListener('alojau:api-slow-start', show)
      window.removeEventListener('alojau:api-slow-end', hide)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-16 z-30 bg-navy-900/95 text-white border-b border-white/10"
    >
      <div className="container-main py-2 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="w-4 h-4 shrink-0 rounded-full border-2 border-white/30 border-t-gold-400 animate-spin"
        />
        <p className="text-xs sm:text-sm text-navy-100">
          Despertando el servidor, puede tardar hasta 50 segundos por inactividad. Tus datos se cargarán solos, no recargues.
        </p>
      </div>
    </div>
  )
}
