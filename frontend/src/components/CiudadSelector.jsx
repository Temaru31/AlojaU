import { useEffect, useState } from 'react'
import { api } from '../services/api'

const FALLBACK = [{ id: 1, nombre: 'Popayán', departamento: 'Cauca', slug: 'popayan' }]

/**
 * CiudadSelector — Fase 4 multiciudad (dinámico, default Popayán).
 * Contrato: value (id|null) + onChange(id|null) -> ?ciudad_id= en la URL.
 * Si el backend no responde, usa fallback Popayán para no bloquear.
 * `ciudades` (opcional): lista compartida desde el padre para usar la misma
 * fuente que la píldora del Hero (evita doble fetch y divergencias).
 */
export const CIUDADES_FALLBACK = [{ id: 1, nombre: 'Popayán', departamento: 'Cauca', slug: 'popayan' }]

export function etiquetaCiudad(c) {
  if (!c) return 'Popayán, Cauca'
  return `${c.nombre}, ${c.departamento}`
}

export default function CiudadSelector({ value, onChange, inputId = 'ciudad', ciudades }) {
  const [remotas, setRemotas] = useState(ciudades || null)
  const [abierto, setAbierto] = useState(false)

  // Solo fetchea si el padre no proveyó la lista (retro-compatibilidad).
  useEffect(() => {
    if (ciudades && ciudades.length > 0) { setRemotas(ciudades); return }
    if (ciudades) return
    let alive = true
    api.get('/api/ciudades')
      .then((r) => {
        if (!alive || !Array.isArray(r.data) || r.data.length === 0) return
        setRemotas(r.data)
      })
      .catch(() => { /* fallback Popayán */ })
    return () => { alive = false }
  }, [ciudades])

  const lista = (remotas && remotas.length > 0) ? remotas : CIUDADES_FALLBACK
  const sel = lista.find((c) => String(c.id) === String(value)) || lista[0] || null
  const etiqueta = sel ? etiquetaCiudad(sel) : 'Todas las ciudades'

  return (
    <div className="relative">
      <button
        type="button"
        id={inputId}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="select-field flex w-full items-center justify-between gap-2 text-left"
        title={etiqueta}
      >
        <span className="truncate">{abierto ? 'Seleccionar ciudad…' : etiqueta}</span>
        <svg className={`w-4 h-4 shrink-0 text-neutral-400 transition ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {abierto && (
        <ul role="listbox" aria-label="Ciudades" className="absolute z-30 mt-1.5 w-full rounded-lg border border-neutral-200 bg-white shadow-xl max-h-56 overflow-auto py-1">
          {lista.map((c) => (
            <li key={c.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={String(value ?? sel?.id) === String(c.id)}
                onClick={() => { onChange(c.id); setAbierto(false) }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-navy-50 ${String(value ?? sel?.id) === String(c.id) ? 'font-semibold text-navy-800 bg-navy-50' : 'text-neutral-700'}`}
              >
                <span className="truncate">{c.nombre}, {c.departamento}</span>
                {String(value ?? sel?.id) === String(c.id) && <span aria-hidden="true" className="text-navy-600">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
