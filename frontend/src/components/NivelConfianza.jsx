// NivelConfianza — Tarjeta radial de nivel (F3, inspiración LinkedIn).
// SVG puro (sin librerías): anillo de progreso con transición CSS en
// stroke-dashoffset (GPU-friendly, sin layout shift; dimensiones fijas,
// respeta prefers-reduced-motion). Un solo role="img" (sin doble anuncio).
// Umbrales SOLO presentación (el puntaje real lo calcula el backend por
// aviso con trust.py): "Verificado" se reserva al 100% (correo+teléfono+
// foto+bio+preferencia+aviso completos); el ámbar usa gold-600 (#B87A18)
// para pasar WCAG no-textual 3:1 sobre el track.
// Uso: <NivelConfianza pct={80} />.
export function nivelDe(pct) {
  if (pct >= 100) return { etiqueta: 'Perfil Verificado', clases: 'bg-emerald-100 text-emerald-800 border-emerald-300', color: '#059669' }
  if (pct >= 50) return { etiqueta: 'Perfil Avanzado', clases: 'bg-navy-50 text-navy-800 border-navy-100', color: '#263A5A' }
  return { etiqueta: 'Perfil Básico', clases: 'bg-amber-100 text-amber-800 border-amber-300', color: '#B87A18' }
}

export default function NivelConfianza({ pct = 0 }) {
  const v = Math.round(Math.max(0, Math.min(100, Number(pct) || 0)))
  const nivel = nivelDe(v)
  const R = 34
  const C = 2 * Math.PI * R
  const offset = C - (C * v) / 100
  const reduceMovimiento = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="flex items-center gap-4 min-h-[96px]">
      <div className="relative w-24 h-24 shrink-0" role="img" aria-label={`Nivel de confianza ${v} por ciento, ${nivel.etiqueta}`}>
        <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90" aria-hidden="true" focusable="false">
          <circle cx="42" cy="42" r={R} fill="none" stroke="#E5E7EB" strokeWidth="9" />
          <circle
            cx="42" cy="42" r={R} fill="none"
            stroke={nivel.color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            style={reduceMovimiento ? undefined : { transition: 'stroke-dashoffset 600ms cubic-bezier(0.2, 0.9, 0.3, 1)' }}
          />
        </svg>
        <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-navy-900 leading-none">{v}%</span>
        </span>
      </div>
      <div className="min-w-0">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${nivel.clases}`}>
          {nivel.etiqueta}
        </span>
        <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
          {v >= 100
            ? 'Perfil completo: máxima señal de confianza.'
            : 'Completa las tareas de abajo para subir de nivel.'}
        </p>
      </div>
    </div>
  )
}
