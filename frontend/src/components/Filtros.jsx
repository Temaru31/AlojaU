// HU-002: Filtros combinables precio, tipo, servicios - multi-checkbox 5 servicios, responsive
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
  return Array.from(current).sort((a,b)=> Number(a)-Number(b)).join(",")
}

export default function Filtros({ filtros, setFiltros }) {
  const selectedIds = parseServicios(filtros.servicios)
  const rangoInvalido = filtros.min && filtros.max && Number(filtros.min) > Number(filtros.max)

  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-center">
        <input
          type="number"
          placeholder="Min COP"
          aria-label="Precio mínimo"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-32 min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtros.min || ''}
          onChange={e => setFiltros({ ...filtros, min: e.target.value })}
          min="0"
        />
        <input
          type="number"
          placeholder="Max COP"
          aria-label="Precio máximo"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-32 min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtros.max || ''}
          onChange={e => setFiltros({ ...filtros, max: e.target.value })}
          min="0"
        />
        <select
          aria-label="Filtrar por tipo"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto min-w-0 col-span-2 sm:col-span-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtros.tipo || ''}
          onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
        >
          <option value="">Tipo</option>
          <option value="HABITACION_FAMILIAR">Habitación familiar</option>
          <option value="HABITACION_INDEPENDIENTE">Habitación independiente</option>
          <option value="APARTAESTUDIO">Apartaestudio</option>
          <option value="COMPARTIDO">Compartido</option>
        </select>

        {/* Servicios multi-checkbox: 1..5, genera query servicios=1,3 */}
        <div className="col-span-2 sm:col-auto flex flex-wrap gap-2 items-center" role="group" aria-label="Filtrar por servicios">
          {SERVICIOS_OPCIONES.map(opt => (
            <label key={opt.id} className="text-xs sm:text-sm flex items-center gap-1.5 select-none cursor-pointer bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
              <input
                type="checkbox"
                className="rounded"
                checked={selectedIds.includes(String(opt.id))}
                onChange={e => setFiltros({ ...filtros, servicios: toggleServicio(filtros.servicios, opt.id, e.target.checked) })}
                aria-label={opt.label}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <button
          className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium sm:ml-auto col-span-2 sm:col-auto w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={() => setFiltros({})}
          type="button"
        >
          Limpiar
        </button>
      </div>
      {rangoInvalido && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3" role="alert">
          Mín no puede ser mayor que Máx (HU-002 C1) — ajusta el rango antes de filtrar
        </p>
      )}
    </div>
  )
}
