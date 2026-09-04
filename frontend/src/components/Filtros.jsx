const SERVICIOS_OPCIONES = [
  { id: 1, label: "WiFi Fibra" },
  { id: 2, label: "Baño Privado" },
  { id: 3, label: "Cocina Compartida" },
  { id: 4, label: "Amoblado" },
  { id: 5, label: "Lavadora" },
]

function parseServicios(serviciosStr) {
  if (!serviciosStr) return []
  return serviciosStr.split(",").map(s => s.trim()).filter(Boolean)
}

function toggleServicio(serviciosStr, servicioId, checked) {
  const current = new Set(parseServicios(serviciosStr))
  const idStr = String(servicioId)
  if (checked) current.add(idStr)
  else current.delete(idStr)
  if (current.size === 0) return undefined
  return Array.from(current).sort((a, b) => Number(a) - Number(b)).join(",")
}

export default function Filtros({ filtros, setFiltros }) {
  const selectedIds = parseServicios(filtros.servicios)
  const hasFilters = filtros.tipo || filtros.wifi || filtros.min || filtros.max || filtros.servicios
  const rangoInvalido = filtros.min && filtros.max && Number(filtros.min) > Number(filtros.max)

  return (
    <div className="card p-4">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-center">
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

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">Precio min COP</label>
          <input
            type="number"
            placeholder="Min COP"
            className="input-field w-full sm:w-32"
            value={filtros.min || ''}
            onChange={e => setFiltros({ ...filtros, min: e.target.value })}
            min="0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">Precio max COP</label>
          <input
            type="number"
            placeholder="Max COP"
            className="input-field w-full sm:w-32"
            value={filtros.max || ''}
            onChange={e => setFiltros({ ...filtros, max: e.target.value })}
            min="0"
          />
        </div>

        {/* Servicios multi-checkbox */}
        <div className="col-span-2 sm:col-auto flex flex-wrap gap-2 items-center" role="group" aria-label="Filtrar por servicios">
          {SERVICIOS_OPCIONES.map(opt => (
            <label key={opt.id} className="text-xs sm:text-sm flex items-center gap-1.5 select-none cursor-pointer bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-1">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-navy-600 focus:ring-navy-200"
                checked={selectedIds.includes(String(opt.id))}
                onChange={e => setFiltros({ ...filtros, servicios: toggleServicio(filtros.servicios, opt.id, e.target.checked) })}
                aria-label={opt.label}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {hasFilters && (
          <button
            className="btn-ghost text-xs ml-auto col-span-2 sm:col-auto"
            onClick={() => setFiltros({})}
            type="button"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar filtros
          </button>
        )}
      </div>
      {rangoInvalido && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3" role="alert">
          Min no puede ser mayor que Max — ajusta el rango antes de filtrar
        </p>
      )}
    </div>
  )
}
