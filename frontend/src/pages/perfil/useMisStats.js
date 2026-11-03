import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { authHead } from '../../services/authHeaders'

/** Resumen del dueño: 3 totales (size=1) en paralelo; cualquier fallo -> sin stats (null). */
export function useMisStats(token) {
  const [misStats, setMisStats] = useState(null)
  useEffect(() => {
    if (!token) { setMisStats(null); return }
    let vivo = true
    const head = authHead(token)
    const total = (params) =>
      api.get('/api/publicaciones/mias', { params: { size: 1, ...params }, ...head })
        .then(r => r.data?.total ?? 0).catch(() => null)
    Promise.all([total({}), total({ estado: 'ACTIVO' }), total({ estado: 'PENDIENTE' })])
      .then(([todas, activas, pendientes]) => {
        if (vivo) setMisStats(todas == null ? null : { total: todas, activas: activas ?? 0, pendientes: pendientes ?? 0 })
      })
    return () => { vivo = false }
  }, [token])
  return misStats
}
