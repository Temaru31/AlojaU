export default function Comparar() {
  const placeholderRows = [
    { label: 'Precio mensual', a: '$450.000', b: '$700.000' },
    { label: 'Deposito', a: '$450.000', b: '$0' },
    { label: 'Tipo', a: 'Habitacion familiar', b: 'Apartaestudio' },
    { label: 'Distancia campus', a: '320 m', b: '850 m' },
    { label: 'Indice confianza', a: '85 — Alto', b: '62 — Medio' },
    { label: 'Servicios', a: 'WiFi, Agua 24h', b: 'WiFi, Cocina, Lavanderia' },
    { label: 'Zona', a: 'Pandiguando', b: 'Centro' },
  ]

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-3xl mx-auto">
        <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <a href="/" className="hover:text-navy-600 transition-colors">Buscar</a>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-neutral-600">Comparar</span>
        </nav>

        <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
          Comparar publicaciones
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          Selecciona 2 o 3 publicaciones del buscador para comparar sus caracteristicas lado a lado.
        </p>

        {/* Selection slots */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {[1, 2, 3].map(n => (
            <div key={n} className="card p-4 border-dashed border-neutral-200 bg-neutral-50 text-center">
              <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-sm font-semibold text-neutral-400">{n}</span>
              </div>
              <p className="text-xs text-neutral-400">Seleccionar publicacion</p>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="card overflow-hidden">
          <div className="p-4 bg-navy-50 border-b border-neutral-150">
            <p className="text-xs font-medium text-navy-700">Vista previa de comparacion</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {placeholderRows.map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-4 px-4 py-3">
                <span className="text-xs font-medium text-neutral-500">{row.label}</span>
                <span className="text-xs text-navy-800 font-medium">{row.a}</span>
                <span className="text-xs text-navy-800 font-medium">{row.b}</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-neutral-50 border-t border-neutral-150">
            <p className="text-xs text-neutral-400 text-center">
              Completa seleccionando publicaciones del buscador. Si falta dato se mostrara "No informado".
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
