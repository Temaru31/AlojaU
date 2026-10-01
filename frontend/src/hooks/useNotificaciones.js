// useNotificaciones — campanita in-app (Fase 3).
//
// - Lee GET /api/notificaciones (paginado, solo_no_leidas=false: trae todo
//   para la bandeja + no_leidas para el badge).
// - marcarLeida(id) optimista con rollback si el PATCH falla.
// - marcarTodas() vía PATCH /leer-todas.
// - Refresco por evento 'alojau:notificaciones-change' (tras publicar,
//   guardar alerta o vincular) + polling pasivo 45 s solo visible +
//   revalidación al enfocar la ventana (patrón useKeepAlive: sin pestaña
//   visible no hay peticiones).
// - Sin token no pide nada (los tests de MisPublicaciones exigen: sin token
//   no se toca /mias; aquí igual con la bandeja privada).
// Uso: const { items, noLeidas, loading, marcarLeida, marcarTodas } =
//   useNotificaciones({ token }).
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export const NOTIF_EVENT = 'alojau:notificaciones-change'
export const NOTIF_POLL_MS = 45_000

export function emitNotificacionesChange() {
  try {
    window.dispatchEvent(new Event(NOTIF_EVENT))
  } catch {
    // SSR/tests sin window: noop
  }
}

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function useNotificaciones({ token } = {}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const vivoRef = useRef(true)
  useEffect(() => () => { vivoRef.current = false }, [])
  // 401/403 = sesión muerta o sin permiso: se pausa el polling para no
  // saturar la pestaña de red con fallidas repetitivas. Se reanuda solo
  // al cambiar el token (nuevo login) o con un 200 posterior.
  const authBloqueadaRef = useRef(false)

  const cargar = useCallback(async (silencioso = false) => {
    if (!token) {
      if (vivoRef.current) {
        setItems([])
        setTotal(0)
        setNoLeidas(0)
        setError('')
      }
      return
    }
    if (!silencioso && vivoRef.current) {
      setLoading(true)
      setError('')
    }
    try {
      const r = await api.get('/api/notificaciones', {
        params: { size: 20 }, headers: headers(token),
      })
      if (!vivoRef.current) return
      authBloqueadaRef.current = false
      setItems(r.data?.items || [])
      setTotal(r.data?.total || 0)
      setNoLeidas(r.data?.no_leidas || 0)
      setError('')
    } catch (e) {
      const status = e?.response?.status
      if (status === 401 || status === 403) authBloqueadaRef.current = true
      if (vivoRef.current && !silencioso) setError('No se pudieron cargar las notificaciones.')
    } finally {
      if (vivoRef.current && !silencioso) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    authBloqueadaRef.current = false
    cargar(false)
    const refrescar = () => {
      if (authBloqueadaRef.current) return
      cargar(true)
    }
    const refrescarSiVisible = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      } catch { /* SSR: igual */ }
      refrescar()
    }
    try {
      window.addEventListener(NOTIF_EVENT, refrescar)
      window.addEventListener('focus', refrescarSiVisible)
    } catch { /* SSR/tests */ }
    const timer = window.setInterval ? window.setInterval(refrescarSiVisible, NOTIF_POLL_MS) : null
    return () => {
      try {
        window.removeEventListener(NOTIF_EVENT, refrescar)
        window.removeEventListener('focus', refrescarSiVisible)
      } catch { /* noop */ }
      if (timer) window.clearInterval(timer)
    }
  }, [cargar])

  const marcarLeida = useCallback(async (id) => {
    if (!token) return
    const prev = { items, noLeidas }
    if (vivoRef.current) {
      setItems((cur) => cur.map((n) => (n.id === id ? { ...n, leida: true } : n)))
      setNoLeidas((n) => Math.max(0, n - 1))
    }
    try {
      await api.patch(`/api/notificaciones/${id}/leer`, {}, { headers: headers(token) })
      try {
        window.dispatchEvent(new Event(NOTIF_EVENT))
      } catch { /* noop */ }
    } catch {
      // Rollback optimista: la fila sigue sin leer.
      if (vivoRef.current) {
        setItems(prev.items)
        setNoLeidas(prev.noLeidas)
        setError('No se pudo marcar como leída.')
      }
    }
  }, [token, items, noLeidas])

  const marcarTodas = useCallback(async () => {
    if (!token) return
    try {
      await api.patch('/api/notificaciones/leer-todas', {}, { headers: headers(token) })
      if (vivoRef.current) {
        setItems((cur) => cur.map((n) => ({ ...n, leida: true })))
        setNoLeidas(0)
      }
    } catch {
      if (vivoRef.current) setError('No se pudieron marcar como leídas.')
    }
  }, [token])

  return { items, total, noLeidas, loading, error, recargar: () => cargar(false), marcarLeida, marcarTodas }
}
