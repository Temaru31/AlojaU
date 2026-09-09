// AuthContext - estado global de autenticación (UX navbar dinámico).
// Patrón: igual que FavoritosContext/CompararContext (token en localStorage,
// fallback seguro sin provider para tests). Uso:
//   <AuthProvider><App/></AuthProvider> y const { token, user, logout } = useAuth().
// Sincronización: Perfil/Publicar emiten 'alojau:auth-change' tras login/logout;
// además se escucha 'storage' (multi-pestaña). El perfil se valida contra
// GET /api/auth/perfil; si el token es inválido (401) se limpia solo.
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)
export const TOKEN_KEY = 'alojau_token'
export const AUTH_EVENT = 'alojau:auth-change'

export const emitAuthChange = () => {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT))
  } catch {
    // SSR/tests sin window: noop
  }
}

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readToken())
  const [user, setUser] = useState(null) // {email, nombre_completo, rol} o null
  const [loading, setLoading] = useState(() => !!readToken())

  const sync = useCallback(async (t) => {
    if (!t) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await api.get('/api/auth/perfil', {
        headers: { Authorization: `Bearer ${t}` },
      })
      setUser(r.data || null)
    } catch (err) {
      // Token inválido/expirado (401) o backend caído: no hay sesión válida.
      if (err?.response?.status === 401) {
        try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
        setToken('')
        setUser(null)
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial + re-sincroniza cuando Perfil/Publicar cambian la sesión.
  useEffect(() => {
    sync(readToken())
    const onChange = () => {
      const t = readToken()
      setToken(t)
      sync(t)
    }
    window.addEventListener(AUTH_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(AUTH_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [sync])

  const login = useCallback((t) => {
    try { localStorage.setItem(TOKEN_KEY, t) } catch { /* noop */ }
    setToken(t)
    sync(t)
    emitAuthChange()
  }, [sync])

  const logout = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
    setToken('')
    setUser(null)
    setLoading(false)
    emitAuthChange()
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, refresh: () => sync(readToken()) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Fallback seguro para tests o rendering sin provider (sesión anónima).
    return { token: '', user: null, loading: false, login: () => {}, logout: () => {}, refresh: () => {} }
  }
  return ctx
}

// Iniciales para el avatar ("María José" -> "MJ", "a@b.co" -> "A").
export function inicialesDe(user) {
  const base = user?.nombre_completo?.trim() || user?.email?.trim() || ''
  if (!base) return '?'
  const nombre = base.includes('@') ? base.split('@')[0] : base
  const partes = nombre.replace(/[._-]+/g, ' ').split(' ').filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}
