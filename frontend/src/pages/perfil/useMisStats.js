import { useState, useEffect } from 'react'
import { contarMisPublicaciones } from '../../services/publicacionesApi'

/** Resumen del dueño: 3 totales (size=1) en paralelo; cualquier fallo -> sin stats (null). */
export function useMisStats(token) {
  const [misStats, setMisStats] = useState(null)
  useEffect(() => {
    if (!token) { setMisStats(null); return }
    let vivo = true
    const total = (estado) => contarMisPublicaciones(token, estado).then(t => t ?? 0).catch(() => null)
    Promise.all([total(), total('ACTIVO'), total('PENDIENTE')])
      .then(([todas, activas, pendientes]) => {
        if (vivo) setMisStats(todas == null ? null : { total: todas, activas: activas ?? 0, pendientes: pendientes ?? 0 })
      })
    return () => { vivo = false }
  }, [token])
  return misStats
}
