import { useState } from 'react'

const friendly = (indice) => {
  if (indice >= 80) return {
    label: 'Confianza Alta',
    color: 'text-emerald-700',
    bg: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    light: 'bg-emerald-50 border-emerald-200',
    emoji: '✅',
    msg: '¡Se ve bien! Información completa y contacto verificado.',
  }
  if (indice >= 50) return {
    label: 'Confianza Media',
    color: 'text-gold-700',
    bg: 'bg-gold-500',
    bar: 'bg-gold-500',
    light: 'bg-gold-50 border-gold-200',
    emoji: '⚠️',
    msg: 'Bastante bien, pero revisa detalles antes de pagar.',
  }
  return {
    label: 'Confianza Básica',
    color: 'text-orange-700',
    bg: 'bg-orange-500',
    bar: 'bg-orange-500',
    light: 'bg-orange-50 border-orange-200',
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

export default function IndiceConfianza({ indice = 0, desglose = {} }) {
  const [open, setOpen] = useState(false)
  const f = friendly(indice)
  const details = friendlyDetails(desglose)

  return (
    <div className={`border rounded-xl p-4 sm:p-5 bg-white min-w-0 overflow-hidden ${f.light}`}>
      {/* Header amigable */}
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${f.bg} text-white flex flex-col items-center justify-center shrink-0 shadow-sm`}>
          <span className="text-lg sm:text-xl font-extrabold leading-none">{indice}</span>
          <span className="text-[10px] font-medium opacity-90">/100</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-sm sm:text-base flex items-center gap-1.5 ${f.color}`}>
            <span>{f.emoji}</span> {f.label}
          </p>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1 break-words leading-snug">{f.msg}</p>
          <p className="text-[11px] text-neutral-400 mt-1">No es garantía. Verifica en persona antes de pagar.</p>
        </div>
      </div>

      {/* Barra visual */}
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
          <span>0</span><span>50</span><span>100</span>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-2.5 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${f.bar}`} style={{ width: `${Math.max(4, indice)}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
          <span>Básico</span><span>Medio</span><span>Alto</span>
        </div>
      </div>

      {/* Botón desplegable */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-4 w-full text-xs sm:text-sm font-medium text-navy-600 hover:text-navy-700 bg-neutral-50 border border-neutral-200 hover:border-navy-300 rounded-lg py-2 px-3 flex items-center justify-center gap-1.5 transition"
      >
        {open ? 'Ocultar detalles' : 'Ver por qué este puntaje'}
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Detalles amigables */}
      {open && (
        <div data-testid="detalles" className="mt-4 space-y-2.5 animate-in">
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
