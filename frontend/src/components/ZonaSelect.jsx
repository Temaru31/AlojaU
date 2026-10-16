import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

// Catálogo inicial de Popayán (v10): los que no traigan id viajan como
// barrio libre (barrio_texto). Sin tildes duplicadas a propósito: el match
// es insensible a tildes/mayúsculas.
export const BARRIOS_POPAYAN = [
  'Tulcán', 'Torobajo', 'Centro', 'Pandiguando', 'Catay', 'Alfonso López',
  'Santa Inés', 'La Estancia', 'Campo Hermoso', 'Bello Horizonte',
  'María Occidente', 'Los Hoyos', 'Modelo', 'San José', 'Rincón de la Estancia',
]

function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Resuelve texto -> { zona_barrio_id|null, barrio_texto|null, etiqueta }. */
export function resolverBarrio(texto, zonas = []) {
  const limpio = (texto || '').trim()
  if (!limpio) return { zona_barrio_id: null, barrio_texto: null, etiqueta: '' }
  const norm = normalizar(limpio)
  const hit = (zonas || []).find((z) => normalizar(z.nombre) === norm)
  if (hit) return { zona_barrio_id: hit.id, barrio_texto: null, etiqueta: hit.nombre }
  return { zona_barrio_id: null, barrio_texto: limpio.slice(0, 120), etiqueta: limpio }
}

/**
 * ZonaSelect — combobox de barrios (catálogo o texto libre).
 * Input editable + datalist: catálogo de Popayán + zonas de la API.
 * Contrato: value { zona_barrio_id, barrio_texto } + onChange(mismo).
 */
export default function ZonaSelect({ value, onChange, inputId = 'zona-barrio', error = '' }) {
  const [zonas, setZonas] = useState([])
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let viva = true
    api.get('/api/zonas')
      .then((r) => { if (viva && Array.isArray(r.data)) setZonas(r.data) })
      .catch(() => { /* catálogo estático basta */ })
    return () => { viva = false }
  }, [])

  // Sincroniza el texto visible cuando el padre fija una zona (edición, reset).
  useEffect(() => {
    if (value?.zona_barrio_id != null) {
      const z = zonas.find((x) => String(x.id) === String(value.zona_barrio_id))
      setTexto(z ? z.nombre : texto)
    } else if (value?.barrio_texto) {
      setTexto(value.barrio_texto)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.zona_barrio_id, value?.barrio_texto, zonas])

  const opciones = useMemo(() => {
    const delApi = (zonas || []).map((z) => z.nombre)
    const todas = [...delApi]
    for (const b of BARRIOS_POPAYAN) {
      if (!todas.some((n) => normalizar(n) === normalizar(b))) todas.push(b)
    }
    return todas.sort((a, b) => a.localeCompare(b, 'es'))
  }, [zonas])

  const esLibre = texto.trim() !== '' && resolverBarrio(texto, zonas).zona_barrio_id == null

  return (
    <div>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded="false"
        aria-autocomplete="list"
        aria-describedby={error ? `${inputId}-error` : undefined}
        value={texto}
        onChange={(e) => {
          const t = e.target.value
          setTexto(t)
          onChange(resolverBarrio(t, zonas))
        }}
        placeholder="Ej: Tulcán, Santa Inés…"
        list={`${inputId}-lista`}
        autoComplete="off"
        className={`input-field ${error ? '!border-red-300 !shadow-none' : ''}`}
      />
      <datalist id={`${inputId}-lista`}>
        {opciones.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {esLibre && (
        <p className="text-[11px] text-navy-600 mt-1">
          Usarás el barrio personalizado “{texto.trim()}”.
        </p>
      )}
      {error && <p id={`${inputId}-error`} className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
