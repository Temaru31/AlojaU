import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const FavoritosContext = createContext(null)
const PRIMARY_KEY = 'favoritos'
const LEGACY_KEY = 'alojau_favoritos'
const MAX_FAVS = 50
const MAX_ID = 1_000_000

/**
 * Parsea los favoritos desde localStorage.
 * Soporta tanto formato array de objetos [ { publicacionId: 25, guardadoEn: "..." } ]
 * como formato legado de IDs numéricos [ 25, 30 ].
 */
function parseStoredFavoritos() {
  try {
    const raw = localStorage.getItem(PRIMARY_KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const uniqueMap = new Map()

    for (const item of parsed) {
      let id = null
      let guardadoEn = new Date().toISOString()

      if (typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= MAX_ID) {
        id = item
      } else if (item && typeof item === 'object') {
        const rawId = item.publicacionId ?? item.publicacion_id ?? item.id
        if (Number.isInteger(rawId) && rawId >= 1 && rawId <= MAX_ID) {
          id = rawId
          if (item.guardadoEn) guardadoEn = item.guardadoEn
        }
      }

      if (id !== null && !uniqueMap.has(id)) {
        uniqueMap.set(id, { publicacionId: id, guardadoEn })
      }

      if (uniqueMap.size >= MAX_FAVS) break
    }

    return Array.from(uniqueMap.values())
  } catch {
    return []
  }
}

export function FavoritosProvider({ children }) {
  const [favoritos, setFavoritos] = useState(() => parseStoredFavoritos())

  // Persistir de forma segura en ambas claves para compatibilidad
  useEffect(() => {
    try {
      const payload = JSON.stringify(favoritos)
      localStorage.setItem(PRIMARY_KEY, payload)
      localStorage.setItem(LEGACY_KEY, payload)
    } catch {
      // storage lleno o bloqueado: no rompe app
    }
  }, [favoritos])

  // Sincronizar entre pestañas
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PRIMARY_KEY || e.key === LEGACY_KEY) {
        setFavoritos(parseStoredFavoritos())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Alternar favorito (agregar si no existe, quitar si existe)
  const toggle = useCallback((id) => {
    const numId = Number(id)
    if (!Number.isInteger(numId) || numId < 1 || numId > MAX_ID) return
    setFavoritos(prev => {
      const exists = prev.some(f => f.publicacionId === numId)
      if (exists) {
        return prev.filter(f => f.publicacionId !== numId)
      }
      if (prev.length >= MAX_FAVS) return prev
      return [...prev, { publicacionId: numId, guardadoEn: new Date().toISOString() }]
    })
  }, [])

  // Quitar un favorito específico
  const remove = useCallback((id) => {
    const numId = Number(id)
    if (!Number.isInteger(numId)) return
    setFavoritos(prev => prev.filter(f => f.publicacionId !== numId))
  }, [])

  // Limpiar todos los favoritos
  const clear = useCallback(() => {
    setFavoritos([])
    try {
      localStorage.removeItem(PRIMARY_KEY)
      localStorage.removeItem(LEGACY_KEY)
    } catch {}
  }, [])

  // Verificar si un ID es favorito
  const isFav = useCallback((id) => {
    const numId = Number(id)
    return favoritos.some(f => f.publicacionId === numId)
  }, [favoritos])

  // Lista plana de IDs
  const ids = useMemo(() => favoritos.map(f => f.publicacionId), [favoritos])

  return (
    <FavoritosContext.Provider
      value={{
        favoritos,
        ids,
        toggle,
        remove,
        quitar: remove,
        clear,
        isFav,
        count: favoritos.length,
      }}
    >
      {children}
    </FavoritosContext.Provider>
  )
}

export function useFavoritos() {
  const ctx = useContext(FavoritosContext)
  if (!ctx) {
    // Fallback seguro para tests o rendering sin provider
    return {
      favoritos: [],
      ids: [],
      toggle: () => {},
      remove: () => {},
      quitar: () => {},
      isFav: () => false,
      clear: () => {},
      count: 0,
    }
  }
  return ctx
}
