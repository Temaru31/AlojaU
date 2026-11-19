// Datos que la página de detalle pide al backend o al navegador, uno por hook.
import { useCallback, useEffect, useRef, useState } from 'react'
import useCarga from '../../hooks/useCarga'
import { diasDesactualizadaEfectiva } from '../../constants'
import { obtenerCampus, obtenerConfigPublica } from '../../services/catalogosApi'
import { historialDeAviso, obtenerPublicacion, registrarVista, similaresDe } from '../../services/publicacionesApi'

/** El aviso; con token, el dueño/Admin también ve los que no están ACTIVO. */
export function useAviso(id, campusId, token) {
  const { datos, cargando, error, setDatos } = useCarga(() => {
    const query = campusId ? `?campus_id=${encodeURIComponent(campusId)}` : ''
    return obtenerPublicacion(id, { token, query })
  }, [id, campusId, token])
  const loadError = !error ? '' : (error?.response?.status === 404 ? 'not-found' : 'network')
  return { pub: datos, setPub: setDatos, loading: cargando, loadError }
}

/** Hasta 4 avisos de la misma zona. */
export function useSimilares(pub) {
  return useCarga(() => similaresDe(pub.id, { limit: 4 }), [pub], { inicial: [], activo: !!pub }).datos
}

/** Trazabilidad del aviso: solo se pide con sesión (el backend da 403 a quien no es dueño). */
export function useHistorialAviso(pub, token) {
  return useCarga(() => historialDeAviso(pub.id, token), [pub, token], { activo: !!pub && !!token }).datos
}

/** Catálogo de lugares, para resolver `?campus_id=` si el backend no trae `campus_ref`. */
export function useLugares(campusId) {
  const { datos } = useCarga(obtenerCampus, [campusId], { inicial: [], activo: !!campusId })
  return Array.isArray(datos) ? datos : []
}

/** Días tras los que un aviso se marca "desactualizado" (config pública, con respaldo local). */
export function useDiasDesactualizada() {
  const { datos: config } = useCarga(obtenerConfigPublica, [])
  return Number(config?.dias_desactualizada) || diasDesactualizadaEfectiva()
}

/** Una vista por aviso (el backend deduplica por IP y día). */
export function useRegistroVista(pub) {
  const enviada = useRef(null)
  useEffect(() => {
    if (!pub || enviada.current === pub.id) return
    enviada.current = pub.id
    try {
      registrarVista(pub.id)
    } catch {
      // Métrica best-effort: nunca bloquea el detalle.
    }
  }, [pub])
}

/** Mensaje breve en la página (y en el Toaster global si existe) que se borra solo. */
export function useToastLocal(duracionMs = 3500) {
  const [toast, setToast] = useState('')
  const temporizador = useRef(null)

  // Al salir de la página no debe quedar un toast pendiente de borrarse.
  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  const mostrarToast = useCallback((mensaje) => {
    setToast(mensaje)
    try {
      window.dispatchEvent(new CustomEvent('alojau:toast', { detail: { message: mensaje } }))
    } catch {
      // Sin Toaster global: basta el toast local.
    }
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setToast(''), duracionMs)
  }, [duracionMs])

  return { toast, mostrarToast }
}
