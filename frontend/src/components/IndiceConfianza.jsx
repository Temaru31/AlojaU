import { useState } from 'react'

const friendly = (indice) => {
  if (indice >= 80) return {
    label: 'Confianza Alta',
    color: 'text-emerald-700',
    bg: 'bg-emerald-500',
    ring: '#10b981',
    light: 'bg-emerald-50 border-emerald-200',
    emoji: '✅',
    msg: '¡Se ve bien! Información completa y contacto verificado.',
  }
  if (indice >= 50) return {
    label: 'Confianza Media',
    color: 'text-amber-700',
    bg: 'bg-amber-400',
    ring: '#f59e0b',
    light: 'bg-amber-50 border-amber-200',
    emoji: '⚠️',
    msg: 'Bastante bien, pero revisa detalles antes de pagar.',
  }
  return {
    label: 'Confianza Básica',
    color: 'text-red-700',
    bg: 'bg-red-500',
    ring: '#ef4444',
    light: 'bg-red-50 border-red-200',
    emoji: '🔍',
    msg: 'Revisa con calma, faltan datos importantes.',
  }
}

const friendlyDetails = (desglose = {}) => [
  { key: 'completitud', label: 'Información completa', max: 40, val: desglose.completitud || 0, ok: (desglose.completitud || 0) >= 40, tip: 'Título, descripción, dirección y reglas' },
  { key: 'telefono', label: 'WhatsApp verificado', max: 20, val: desglose.telefono || 0, ok: (desglose.telefono || 0) >= 20, tip: 'Número validado por el arrendador' },
  { key: 'fotos', label: 'Fotos suficientes', max: 15, val: desglose.fotos || 0, ok: (desglose.fotos || 0) >= 15, tip: 'Al menos 3 fotos reales' },
  { key: 'vigencia', label: 'Publicación vigente', max: 15, val: desglose.vigencia || 0, ok: (desglose.vigencia || 0) >= 15, tip: 'Actualizada hace menos de 30 días' },
  { key: 'reportes', label: 'Sin reportes', max: 10, val: desglose.reportes || 0, ok: (desglose.reportes || 0) >= 10, tip: 'Nadie ha reportado esta publicación' },
]

const RING_R = 26
const RING_C = 2 * Math.PI * RING_R

export default function IndiceConfianza({ indice = 0, desglose = {} }) {
  const [open, setOpen] = useState(false)
  const f = friendly(indice)
  const details = friendlyDetails(desglose)
  const clamped = Math.max(0, Math.min(100, Number(indice) || 0))
  const avance = ((RING_C * clamped) / 100).toFixed(1)

  return (
    <div className={`border rounded-xl p-4 sm:p-5 bg-white min-w-0 overflow-hidden ${f.light}`}>
      {/* Header amigable con anillo de progreso SVG */}
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" role="img" aria-label={`Confianza ${clamped} de 100`}>
            <circle cx="32" cy="32" r={RING_R} fill="none" strokeWidth="7" className="stroke-neutral-200" />
            <circle
              cx="32"
              cy="32"
              r={RING_R}
              fill="none"
              stroke={f.ring}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${avance} ${RING_C.toFixed(1)}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-lg sm:text-xl font-extrabold text-navy-900">{clamped}</span>
            <span className="text-[10px] font-medium text-neutral-400">/100</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-sm sm:text-base flex items-center gap-1.5 ${f.color}`}>
            <span aria-hidden="true">{f.emoji}</span> {f.label}
          </p>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1 break-words leading-snug">{f.msg}</p>
          <p className="text-[11px] text-neutral-400 mt-1">No es garantía. Verifica en persona antes de pagar.</p>
        </div>
      </div>

      {/* Botón desplegable (UX-AUDIT: aria-controls enlaza al panel) */}
      <button type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="indice-detalle"
        className="mt-4 w-full text-xs sm:text-sm font-medium text-navy-600 hover:text-navy-700 bg-neutral-50 border border-neutral-200 hover:border-navy-300 rounded-lg py-2 px-3 flex items-center justify-center gap-1.5 transition"
      >
        {open ? 'Ocultar detalles' : 'Ver por qué este puntaje'}
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Detalles amigables */}
      {open && (
        <div id="indice-detalle" data-testid="detalles" className="mt-4 space-y-2.5 animate-in">
          {details.map(d => (
            <div key={d.key} className="flex items-start gap-2.5 text-xs sm:text-sm">
              <span className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${d.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-400'}`}>
                {d.ok ? '✓' : '•'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`font-medium truncate ${d.ok ? 'text-neutral-800' : 'text-neutral-500'}`}>{d.label}</p>
                  <span className="text-[11px] text-neutral-500 shrink-0">{d.val}/{d.max}</span>
                </div>
                <p className="text-[11px] text-neutral-500 break-words">{d.tip}</p>
              </div>
            </div>
          ))}
          <div className="pt-3 border-t border-neutral-100 mt-3">
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Este índice es <b>informativo</b> y se calcula automáticamente (40 info completa +20 WhatsApp +15 fotos +15 vigencia +10 sin reportes). Un puntaje alto no garantiza que la vivienda sea segura. Visita el lugar y verifica identidad.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
