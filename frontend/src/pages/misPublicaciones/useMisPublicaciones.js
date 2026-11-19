// Lista paginada de los avisos del dueño, con filtro por estado y orden del
// servidor (ordenar en el cliente mentiría con varias páginas).
import { useCallback, useEffect, useState } from 'react'
import { isCancelError } from '../../services/api'
import { listarMisPublicaciones } from '../../services/publicacionesApi'

export const PAGE_SIZE = 12

function mensajeErrorLista(err) {
  const status = err?.response?.status
  if (status === 401) return 'Sesión vencida. Inicia sesión de nuevo.'
  if (status === 404 || status === 422) {
    return 'Tu backend está desactualizado (falta GET /mias). Reinicia uvicorn en la rama actual.'
  }
  return 'No se pudieron cargar tus publicaciones.'
}

// La API responde una página `{ items, total, pages }` (o una lista, en backends viejos).
function pagina(data) {
  if (Array.isArray(data)) return { items: data, total: data.length, pages: 1 }
  return { items: data.items || [], total: data.total || 0, pages: data.pages || 1 }
}

export default function useMisPublicaciones(token) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [filtro, setFiltro] = useState('')
  const [orden, setOrden] = useState('recientes')
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Cambiar de filtro/página aborta la petición anterior: una respuesta
  // tardía no pisa los resultados actuales.
  useEffect(() => {
    if (!token) {
      setItems([])
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listarMisPublicaciones(token,
      { page, size: PAGE_SIZE, ...(filtro ? { estado: filtro } : {}), orden },
      { signal: controller.signal })
      .then(data => {
        const p = pagina(data)
        setItems(p.items); setTotal(p.total); setPages(p.pages)
      })
      .catch(err => {
        if (isCancelError(err) || controller.signal.aborted) return
        setError(mensajeErrorLista(err))
        setItems([])
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, page, filtro, orden, reloadKey])

  const cambiarFiltro = useCallback((v) => { setFiltro(v); setPage(1) }, [])
  const cambiarOrden = useCallback((v) => { setOrden(v); setPage(1) }, [])
  const recargar = useCallback(() => setReloadKey(k => k + 1), [])

  /** Aplica `cambio` al aviso `id` (tras editar, renovar o pausar). */
  const actualizarAviso = useCallback((id, cambio) => {
    setItems(prev => prev.map(x => (x.id === id ? { ...x, ...cambio } : x)))
  }, [])

  const quitarAviso = useCallback((id) => {
    setItems(prev => prev.filter(x => x.id !== id))
    setTotal(t => Math.max(0, t - 1))
  }, [])

  return {
    items, total, pages, page, setPage, filtro, cambiarFiltro, orden, cambiarOrden,
    loading, error, setError, recargar, actualizarAviso, quitarAviso,
  }
}
