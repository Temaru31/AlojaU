import { useEffect, useMemo, useRef, useState } from 'react'

export const CATEGORIAS_LUGAR = [
  { id: 'UNIVERSIDAD', etiqueta: 'Universidades', icono: '🏫' },
  { id: 'CENTRO_COMERCIAL', etiqueta: 'Centros comerciales', icono: '🛍️' },
  { id: 'SALUD', etiqueta: 'Salud', icono: '🏥' },
  { id: 'TRANSPORTE', etiqueta: 'Transporte', icono: '🚌' },
  { id: 'OTRO', etiqueta: 'Otros puntos', icono: '📍' },
]

export function etiquetaLugar(lugar) {
  if (!lugar) return 'Todos los lugares'
  const inst = lugar.institucion || ''
  const sede = lugar.nombre_sede && lugar.nombre_sede !== 'Sede Única' ? ` - ${lugar.nombre_sede}` : ''
  return `${inst}${sede}`
}

function iconoCategoria(cat) {
  return (CATEGORIAS_LUGAR.find(c => c.id === cat) || CATEGORIAS_LUGAR[4]).icono
}

/**
 * CercanoA — selector "Cercano a..." agrupado por categoría (004 POIs).
 * Reemplaza al <select> plano de campus: searchable, con encabezados por
 * categoría. Contrato intacto: onChange(id | null) -> ?campus_id= en la URL.
 */
export default function CercanoA({ lugares = [], value, onChange, inputId = 'cercano-a' }) {
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const raizRef = useRef(null)
  const inputRef = useRef(null)
  const seleccionado = lugares.find(l => String(l.id) === String(value))

  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (e) => {
      if (raizRef.current && !raizRef.current.contains(e.target)) setAbierto(false)
    }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrarFuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', cerrarFuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const grupos = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const base = q
      ? lugares.filter(l => `${l.institucion} ${l.nombre_sede}`.toLowerCase().includes(q))
      : lugares
    return CATEGORIAS_LUGAR
      .map(cat => ({ ...cat, items: base.filter(l => (l.categoria || 'UNIVERSIDAD') === cat.id) }))
      .filter(g => g.items.length > 0)
  }, [lugares, filtro])

  const elegir = (id) => {
    onChange(id)
    setAbierto(false)
    setFiltro('')
  }

  return (
    <div ref={raizRef} className="relative">
      <button
        type="button"
        id={inputId}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => {
          setAbierto(v => !v)
          if (!abierto) window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="select-field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="truncate">
          {seleccionado ? `${iconoCategoria(seleccionado.categoria)} ${etiquetaLugar(seleccionado)}` : 'Todos los lugares'}
        </span>
        <svg className={`w-4 h-4 shrink-0 text-neutral-400 transition ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {abierto && (
        <div className="absolute z-30 mt-1.5 w-full min-w-64 rounded-lg border border-neutral-200 bg-white shadow-xl">
          <div className="p-2 border-b border-neutral-100">
            <input
              ref={inputRef}
              type="text"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar lugar… (ej: hospital, campanario)"
              aria-label="Buscar lugar de referencia"
              className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-400"
            />
          </div>
          <ul role="listbox" aria-label="Lugares de referencia" className="max-h-64 overflow-auto py-1">
            <li role="option" aria-selected={value == null || value === ''}>
              <button type="button" onClick={() => elegir(null)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                <span aria-hidden="true">🌐</span> Todos los lugares
              </button>
            </li>
            {grupos.map(g => (
              <li key={g.id}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400" aria-hidden="true">
                  {g.icono} {g.etiqueta}
                </p>
                <ul>
                  {g.items.map(l => (
                    <li key={l.id} role="option" aria-selected={String(value) === String(l.id)}>
                      <button
                        type="button"
                        onClick={() => elegir(l.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-navy-50 ${String(value) === String(l.id) ? 'font-semibold text-navy-800 bg-navy-50' : 'text-neutral-700'}`}
                      >
                        <span className="truncate">{etiquetaLugar(l)}</span>
                        {String(value) === String(l.id) && <span aria-hidden="true" className="text-navy-600">✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {grupos.length === 0 && (
              <li className="px-3 py-4 text-sm text-neutral-400">Sin lugares para “{filtro}”</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
