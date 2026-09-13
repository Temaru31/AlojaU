import { useEffect, useState } from 'react'

/**
 * SearchBar — texto libre con debounce 300ms (Oleada 2).
 * Controlado desde fuera vía `value` (URL); el estado interno evita
 * peticiones por cada tecla. Enter aplica de inmediato.
 */
export default function SearchBar({ value = '', onChange, placeholder = 'Buscar: habitación, amoblado, Tulcán…' }) {
  const [texto, setTexto] = useState(value)

  // Si la URL cambia desde fuera (paginación, limpiar), sincroniza el input.
  useEffect(() => { setTexto(value) }, [value])

  useEffect(() => {
    if (texto === value) return
    const t = window.setTimeout(() => onChange(texto), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  return (
    <div className="relative">
      <svg className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        type="search"
        role="searchbox"
        aria-label="Buscar publicaciones por texto"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onChange(texto) }}
        placeholder={placeholder}
        className="input-field pl-10 pr-9"
        maxLength={100}
      />
      {texto && (
        <button
          type="button"
          onClick={() => { setTexto(''); onChange('') }}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-neutral-400 hover:text-navy-800 hover:bg-neutral-100 flex items-center justify-center transition"
        >
          ×
        </button>
      )}
    </div>
  )
}
