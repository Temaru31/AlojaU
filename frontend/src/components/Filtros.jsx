import { useState } from 'react'
import InfoTooltip from './InfoTooltip'
import useTiposVivienda, { TIPOS_FALLBACK } from '../hooks/useTiposVivienda'

export const SERVICIOS_OPCIONES = [
  { id: 1, label: "WiFi Fibra" },
  { id: 2, label: "Baño Privado" },
  { id: 3, label: "Cocina Compartida" },
  { id: 4, label: "Amoblado" },
  { id: 5, label: "Lavadora" },
]

// M4: primarios en barra superior (precio + tipo + checkboxes principales),
// secundarios en modal "Más Filtros" desktop (el bottom sheet móvil sigue intacto).
export const SERVICIOS_PRINCIPALES = [1, 2, 3]
export const SERVICIOS_SECUNDARIOS = [4, 5]

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

function SelectorTipo({ filtros, setFiltros, id = 'filtro-tipo' }) {
  // M2: catálogo dinámico (/config-publica) con fallback local.
  // Hook incondicional (rules-of-hooks): el hook nunca lanza (fallback interno).
  const { tipos: tiposHook } = useTiposVivienda()
  const tipos = Array.isArray(tiposHook) && tiposHook.length > 0 ? tiposHook : TIPOS_FALLBACK
  return (
    <div className="w-full sm:w-48">
      <label htmlFor={id} className="block text-xs font-medium text-neutral-500 mb-1.5">
        <span className="inline-flex items-center gap-1">
          Tipo de vivienda
          <InfoTooltip texto="El catálogo lo gestiona el admin (nuevos tipos aparecen solos). Filtra por el tipo exacto del aviso." />
        </span>
      </label>
      <select
        id={id}
        className="select-field"
        value={filtros.tipo || ''}
        onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
      >
        <option value="">Todos los tipos</option>
        {tipos.map((t) => (
          <option key={t.slug} value={t.slug} title={t.descripcion_tooltip || ''}>
            {t.icono ? `${t.icono} ` : ''}{t.nombre_visible || t.slug}
          </option>
        ))}
      </select>
    </div>
  )
}

function GrupoServicios({ filtros, setFiltros, ids }) {
  const selectedIds = parseServicios(filtros.servicios)
  const ops = SERVICIOS_OPCIONES.filter((o) => ids.includes(o.id))
  return (
    <div className="col-span-2 sm:col-auto flex flex-wrap gap-2 items-center" role="group" aria-label="Filtrar por servicios">
      {ops.map(opt => (
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
  )
}

function CamposPrecio({ filtros, setFiltros, sufijo = '' }) {
  return (
    <>
      <div>
        <label htmlFor={`filtro-min${sufijo}`} className="block text-xs font-medium text-neutral-500 mb-1.5">Precio min COP</label>
        <input
          id={`filtro-min${sufijo}`}
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
        <label htmlFor={`filtro-max${sufijo}`} className="block text-xs font-medium text-neutral-500 mb-1.5">Precio max COP</label>
        <input
          id={`filtro-max${sufijo}`}
          type="number"
          placeholder="Max COP"
          aria-label="Precio máximo en COP"
          className="input-field w-full sm:w-32"
          value={filtros.max || ''}
          onChange={e => setFiltros({ ...filtros, max: e.target.value })}
          min="0"
        />
      </div>
    </>
  )
}

function PanelCampos({ filtros, setFiltros }) {
  // Completo (mobile sheet intacto + compat): precio + tipo + todos los servicios.
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
      <CamposPrecio filtros={filtros} setFiltros={setFiltros} />
      <SelectorTipo filtros={filtros} setFiltros={setFiltros} />
      <GrupoServicios filtros={filtros} setFiltros={setFiltros} ids={SERVICIOS_OPCIONES.map((o) => o.id)} />
    </div>
  )
}

// M4 primario desktop: precio + tipo + checkboxes principales.
export function PanelPrimario({ filtros, setFiltros }) {
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
      <CamposPrecio filtros={filtros} setFiltros={setFiltros} sufijo="-prim" />
      <SelectorTipo filtros={filtros} setFiltros={setFiltros} id="filtro-tipo-prim" />
      <GrupoServicios filtros={filtros} setFiltros={setFiltros} ids={SERVICIOS_PRINCIPALES} />
    </div>
  )
}

// M4 modal "Más Filtros" desktop: secundarios en drawer/modal (reutiliza contarAvanzados).
export function MasFiltrosModal({ filtros, setFiltros }) {
  const [abierto, setAbierto] = useState(false)
  const total = contarAvanzados(filtros)
  const secundarios = parseServicios(filtros.servicios).filter((s) =>
    SERVICIOS_SECUNDARIOS.includes(Number(s)))

  const cerrar = () => setAbierto(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Abrir más filtros${total > 0 ? `, ${total} activos` : ''}`}
        className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition bg-white text-navy-800 border-neutral-200 hover:border-navy-300"
      >
        <span aria-hidden="true">⚙️</span> Más Filtros
        {total > 0 && (
          <span className="inline-flex items-center rounded-full bg-navy-800 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${total} filtros activos`}>
            {total}
          </span>
        )}
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 hidden md:block" role="dialog" aria-modal="true" aria-label="Más filtros">
          <div aria-hidden="true" onClick={cerrar} className="absolute inset-0 bg-navy-950/60" />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-100">
              <p className="text-sm font-bold text-navy-900">
                Más Filtros
                {total > 0 && <span className="ml-2 text-[11px] font-bold text-navy-700 bg-navy-50 rounded-full px-2 py-0.5">{total} activos</span>}
              </p>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar más filtros"
                className="w-11 h-11 rounded-full text-neutral-500 hover:bg-neutral-100 flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-neutral-600 mb-2">Servicios adicionales</p>
                <GrupoServicios filtros={filtros} setFiltros={setFiltros} ids={SERVICIOS_SECUNDARIOS} />
                {secundarios.length > 0 && (
                  <p className="text-[11px] text-neutral-400 mt-2">{secundarios.length} secundarios activos</p>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Los filtros principales (precio, tipo y servicios básicos) quedan en la barra superior.
                Aquí solo van los secundarios.
              </p>
            </div>
            <div className="p-4 border-t border-neutral-100 bg-white flex gap-2">
              <button
                type="button"
                onClick={() => setFiltros({ ...filtros, servicios: (() => {
                  const keep = parseServicios(filtros.servicios).filter((s) => !SERVICIOS_SECUNDARIOS.includes(Number(s)))
                  return keep.length ? keep.join(',') : ''
                })() })}
                className="btn-ghost text-xs"
              >
                Limpiar secundarios
              </button>
              <button
                type="button"
                onClick={cerrar}
                className="btn-accent flex-1 justify-center !py-3"
              >
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
