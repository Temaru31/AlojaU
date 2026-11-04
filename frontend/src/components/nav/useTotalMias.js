import { useState, useEffect } from 'react'
import { AUTH_EVENT, MIAS_EVENT } from '../../contexts/AuthContext'
import { api } from '../../services/api'
import { bearer } from '../../services/authHeaders'

/**
 * Contador de avisos propios: "Mis publicaciones" se oculta con 0 avisos
 * confirmados (Usuario Base nuevo) y aparece tras la primera publicación
 * (cualquier estado). Fail-open: desconocido/error -> null (visible; nunca
 * castigar la UX por un fallo de red; sin sesión no se pide /mias).
 */
export function useTotalMias(sesionActiva, token) {
  const [totalMias, setTotalMias] = useState(null)
  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      if (!sesionActiva || !token) {
        if (vivo) setTotalMias(null)
        return
      }
      try {
        const r = await api.get('/api/publicaciones/mias', {
          params: { size: 1 },
          headers: bearer(token),
        })
        // Solo un total numérico oculta el enlace; cualquier otra forma
        // (error, contrato futuro) mantiene visible (fail-open).
        const t = r.data?.total
        if (vivo) setTotalMias(typeof t === 'number' ? t : null)
      } catch {
        if (vivo) setTotalMias(null)
      }
    }
    cargar()
    const refrescar = () => { if (vivo) void cargar() }
    window.addEventListener(AUTH_EVENT, refrescar)
    window.addEventListener(MIAS_EVENT, refrescar)
    return () => {
      vivo = false
      window.removeEventListener(AUTH_EVENT, refrescar)
      window.removeEventListener(MIAS_EVENT, refrescar)
    }
  }, [sesionActiva, token])
  return totalMias
}
