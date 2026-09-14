import { useEffect, useState } from 'react'

/**
 * useDebounce — Fase 3: evita peticiones por cada tecla.
 * Uso: const qDebounced = useDebounce(texto, 300).
 * Ej: SearchBar escribe a la URL solo tras 300ms sin teclear.
 */
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return debounced
}
