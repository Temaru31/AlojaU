export default function IndiceConfianza({ indice = 0, desglose = {} }) {
  const level = indice >= 80 ? 'high' : indice >= 50 ? 'mid' : 'low'

  const config = {
    high: { label: 'Alto', color: 'text-emerald-700', bg: 'bg-emerald-500', ring: 'ring-emerald-100', bar: 'bg-emerald-500' },
    mid: { label: 'Medio', color: 'text-gold-700', bg: 'bg-gold-500', ring: 'ring-gold-100', bar: 'bg-gold-500' },
    low: { label: 'Basico', color: 'text-orange-700', bg: 'bg-orange-500', ring: 'ring-orange-100', bar: 'bg-orange-500' },
  }

  const c = config[level]

  const items = [
    { label: 'Completitud', value: desglose.completitud || 0, max: 40 },
    { label: 'Telefono validado', value: desglose.telefono || 0, max: 20 },
    { label: 'Fotos', value: desglose.fotos || 0, max: 15 },
    { label: 'Vigencia', value: desglose.vigencia || 0, max: 15 },
    { label: 'Sin reportes', value: desglose.reportes || 0, max: 10 },
  ]

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`relative w-14 h-14 rounded-full ${c.bg} flex items-center justify-center ring-4 ${c.ring}`}>
          <span className="text-white font-display font-bold text-lg">{indice}</span>
        </div>
        <div>
          <p className={`font-semibold text-sm ${c.color}`}>{c.label}</p>
          <p className="text-xs text-neutral-400">Indice de confianza</p>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        {items.map((item, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500">{item.label}</span>
              <span className="text-xs font-medium text-neutral-600">{item.value}/{item.max}</span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${c.bar} rounded-full transition-all duration-500`}
                style={{ width: `${(item.value / item.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-gold-50 border border-gold-200 rounded-md">
        <div className="flex gap-2">
          <svg className="w-4 h-4 text-gold-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-xs text-gold-700 leading-relaxed">
            Informativo, no garantiza seguridad. Verificar antes de pagar.
          </p>
        </div>
      </div>
    </div>
  )
}
