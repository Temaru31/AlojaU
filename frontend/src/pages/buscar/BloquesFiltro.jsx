// Bloques de filtro de la búsqueda: tipos de vivienda y servicios (colapsables).
import { useState } from 'react'
import { parseServicios, toggleServicio, SERVICIOS_OPCIONES, SelectorTipoChips } from '../../components/Filtros'





// Del sheet: chips de tipo desde el catálogo dinámico (misma
// fuente que desktop: `filtros.tipo`). Delega en el componente compartido
// (paridad exacta con el drawer desktop).
export function BloqueTipos({ filtros, setFiltros }) {
  return <SelectorTipoChips filtros={filtros} setFiltros={setFiltros} />
}

// Del sheet: grid de servicios colapsable. Con el catálogo actual
// (5) va abierto; si supera 6 ítems arranca colapsado para no saturar.
const UMBRAL_COLAPSO_SERVICIOS = 6

export function BloqueServicios({ items = SERVICIOS_OPCIONES, filtros, setFiltros }) {
  const [abierto, setAbierto] = useState(items.length <= UMBRAL_COLAPSO_SERVICIOS)
  const elegidos = parseServicios(filtros.servicios)
  return (
    <section aria-labelledby="f-serv-m" className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="f-serv-grid-m"
        className="flex w-full items-center justify-between gap-2 min-h-[44px]"
      >
        <span className="text-xs font-bold text-navy-800" id="f-serv-m">
          4 · Servicios y comodidades
          {elegidos.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-navy-800 px-2 py-0.5 text-[11px] font-bold text-white">
              {elegidos.length}
            </span>
          )}
        </span>
        <span aria-hidden="true" className={`text-neutral-400 text-xs transition-transform ${abierto ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {abierto && (
        <div id="f-serv-grid-m" className="grid grid-cols-2 gap-2">
          {items.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-2 min-h-[44px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition active:scale-[0.98] ${elegidos.includes(String(opt.id))
                ? 'border-navy-800 ring-2 ring-navy-800/25 bg-navy-50 text-navy-900'
                : 'border-neutral-200 bg-white text-neutral-600 active:bg-neutral-50'
                }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-neutral-300 text-navy-800 accent-navy-800"
                checked={elegidos.includes(String(opt.id))}
                onChange={(e) => setFiltros({ ...filtros, servicios: toggleServicio(filtros.servicios, opt.id, e.target.checked) })}
                aria-label={opt.label}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
