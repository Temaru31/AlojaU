export default function Filtros({ filtros, setFiltros }) {
  const hasFilters = filtros.tipo || filtros.wifi || filtros.min || filtros.max

  return (
    <div className="card p-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="w-full sm:w-48">
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">Tipo de vivienda</label>
          <select
            className="select-field"
            value={filtros.tipo || ''}
            onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
          >
            <option value="">Todos los tipos</option>
            <option value="HABITACION_FAMILIAR">Habitacion familiar</option>
            <option value="HABITACION_INDEPENDIENTE">Habitacion independiente</option>
            <option value="APARTAESTUDIO">Apartaestudio</option>
            <option value="COMPARTIDO">Compartido</option>
          </select>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer px-3 py-2.5 rounded-md hover:bg-neutral-50 transition-colors">
          <input
            type="checkbox"
            checked={!!filtros.wifi}
            onChange={e => setFiltros({ ...filtros, wifi: e.target.checked ? true : undefined })}
            className="w-4 h-4 rounded border-neutral-300 text-navy-600 focus:ring-navy-200"
          />
          <span className="text-sm text-neutral-600">WiFi</span>
        </label>

        {hasFilters && (
          <button
            className="btn-ghost text-xs ml-auto"
            onClick={() => setFiltros({})}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
