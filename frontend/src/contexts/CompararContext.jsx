import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CompararContext = createContext(null)
const STORAGE_KEY = 'alojau_comparar'
const MAX_COMPARAR = 3
const MAX_ID = 1_000_000

function parseStoredComparar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(id => Number.isInteger(id) && id >= 1 && id <= MAX_ID)
      .slice(0, MAX_COMPARAR)
  } catch {
    return []
  }
}

export function CompararProvider({ children }) {
  const [comparar, setComparar] = useState(() => parseStoredComparar())
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(comparar))
    } catch {}
  }, [comparar])

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setComparar(parseStoredComparar())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((id) => {
    if (!Number.isInteger(id) || id < 1 || id > MAX_ID) return
    setError('')
    setComparar(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_COMPARAR) {
        setError(`Máximo ${MAX_COMPARAR} para comparar (HU-004)`)
        return prev
      }
      return [...prev, id]
    })
  }, [])

  const isSelected = useCallback((id) => comparar.includes(id), [comparar])
  const clear = useCallback(() => { setComparar([]); setError('') }, [])
  const canCompare = comparar.length >= 2

  return (
    <CompararContext.Provider value={{ comparar, toggle, isSelected, clear, error, canCompare, count: comparar.length, max: MAX_COMPARAR }}>
      {children}
    </CompararContext.Provider>
  )
}

export function useComparar() {
  const ctx = useContext(CompararContext)
  if (!ctx) {
    return { comparar: [], toggle: () => {}, isSelected: () => false, clear: () => {}, error: '', canCompare: false, count: 0, max: 3 }
  }
  return ctx
}
