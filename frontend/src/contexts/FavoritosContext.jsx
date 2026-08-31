import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const FavoritosContext = createContext(null)
const STORAGE_KEY = 'alojau_favoritos'
const MAX_FAVS = 50
const MAX_ID = 1_000_000

function parseStoredFavoritos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(id => Number.isInteger(id) && id >= 1 && id <= MAX_ID)
      .slice(0, MAX_FAVS)
  } catch {
    return []
  }
}

export function FavoritosProvider({ children }) {
  const [favoritos, setFavoritos] = useState(() => parseStoredFavoritos())

  // Persistir de forma segura
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoritos))
    } catch {
      // storage lleno o bloqueado: no rompe app
    }
  }, [favoritos])

  // Sincronizar entre pestañas
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setFavoritos(parseStoredFavoritos())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((id) => {
    if (!Number.isInteger(id) || id < 1 || id > MAX_ID) return
    setFavoritos(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_FAVS) return prev
      return [...prev, id]
    })
  }, [])

  const isFav = useCallback((id) => favoritos.includes(id), [favoritos])
  const clear = useCallback(() => setFavoritos([]), [])

  return (
    <FavoritosContext.Provider value={{ favoritos, toggle, isFav, clear, count: favoritos.length }}>
      {children}
    </FavoritosContext.Provider>
  )
}

export function useFavoritos() {
  const ctx = useContext(FavoritosContext)
  if (!ctx) {
    // Fallback seguro para tests o rendering sin provider (no rompe, solo deshabilita)
    return { favoritos: [], toggle: () => {}, isFav: () => false, clear: () => {}, count: 0 }
  }
  return ctx
}
