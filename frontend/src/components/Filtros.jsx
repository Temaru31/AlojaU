import { useState } from 'react'

export const SERVICIOS_OPCIONES = [
  { id: 1, label: "WiFi Fibra" },
  { id: 2, label: "Baño Privado" },
  { id: 3, label: "Cocina Compartida" },
  { id: 4, label: "Amoblado" },
  { id: 5, label: "Lavadora" },
]

export function parseServicios(serviciosStr) {
  if (!serviciosStr) return []
  return serviciosStr.split(",").map(s => s.trim()).filter(Boolean)
}

export function toggleServicio(serviciosStr, servicioId, checked) {
  const current = new Set(parseServicios(serviciosStr))
  const idStr = String(servicioId)
  if (checked) current.add(idStr)
  else current.delete(idStr)
  if (current.size === 0) return undefined
  return Array.from(current).sort((a, b) => Number(a) - Number(b)).join(",")
}

/** Nº de filtros avanzados activos (precio min/max + tipo + cada servicio). */
export function contarAvanzados(filtros = {}) {
  let n = 0
  if (filtros.min) n += 1
  if (filtros.max) n += 1
  if (filtros.tipo) n += 1
  n += parseServicios(filtros.servicios).length
  return n
}

function PanelCampos({ filtros, setFiltros }) {
  const selectedIds = parseServicios(filtros.servicios)
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
      <div>
        <label htmlFor="filtro-min" className="block text-xs font-medium text-neutral-500 mb-1.5">Precio min COP</label>
        <input
          id="filtro-min"
          type="number"
          placeholder="Min COP"
          aria-label="Precio mínimo en COP"
          className="input-field w-full sm:w-32"
          value={filtros.min || ''}
          onChange={e => setFiltros({ ...filtros, min: e.target.value })}
          min="0"
        />
      </div>
      <div>
        <label htmlFor="filtro-max" className="block text-xs font-medium text-neutral-500 mb-1.5">Precio max COP</label>
        <input
          id="filtro-max"
          type="number"
          placeholder="Max COP"
          aria-label="Precio máximo en COP"
          className="input-field w-full sm:w-32"
          value={filtros.max || ''}
          onChange={e => setFiltros({ ...filtros, max: e.target.value })}
          min="0"
        />
      </div>
      <div className="w-full sm:w-48">
        <label htmlFor="filtro-tipo" className="block text-xs font-medium text-neutral-500 mb-1.5">Tipo de vivienda</label>
        <select
          id="filtro-tipo"
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
    </div>
  )
}

/**
 * Filtros — nivel Avanzado (precio + tipo + servicios).
 * - Autónomo: muestra su propio botón desplegable con badge.
 * - Controlado (`abierto`/`onToggle`): el padre (barra flotante) maneja el toggle.
 * - `soloPanel`: solo los campos, sin tarjeta ni cabecera (para el panel flotante).
 */
export default function Filtros({ filtros, setFiltros, defaultOpen = false, abierto, onToggle, soloPanel = false }) {
  const [interno, setInterno] = useState(defaultOpen)
  const controlado = abierto !== undefined
  const open = controlado ? abierto : interno
  const setOpen = controlado ? (onToggle || (() => {})) : setInterno
  const activos = contarAvanzados(filtros)
  const hasFilters = activos > 0
  const rangoInvalido = filtros.min && filtros.max && Number(filtros.min) > Number(filtros.max)

  const limpiar = () => setFiltros({ ...filtros, min: '', max: '', tipo: '', servicios: '' })

  if (soloPanel) {
    return (
      <div>
        <PanelCampos filtros={filtros} setFiltros={setFiltros} />
        <div className="flex items-center justify-between mt-3">
          {rangoInvalido ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">
              Min no puede ser mayor que Max — ajusta el rango antes de filtrar
            </p>
          ) : <span />}
          {hasFilters && (
            <button className="btn-ghost text-xs ml-auto" onClick={limpiar} type="button">
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

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-navy-800">
          Filtros avanzados
          {activos > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-navy-800 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${activos} filtros activos`}>
              {activos}
            </span>
          )}
        </span>
        <span aria-hidden="true" className={`text-neutral-400 transition ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="mt-3">
          <PanelCampos filtros={filtros} setFiltros={setFiltros} />
          <div className="flex items-center justify-between mt-3">
            {rangoInvalido ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">
                Min no puede ser mayor que Max — ajusta el rango antes de filtrar
              </p>
            ) : <span />}
            {hasFilters && (
              <button className="btn-ghost text-xs ml-auto" onClick={limpiar} type="button">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
