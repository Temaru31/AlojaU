// Publicidad: planes, destacados del dueño y bandeja admin. Devuelven la
// respuesta de axios (`r.data`), como el resto del módulo original.
import { api, conIdempotencia } from './api'
import { authHead } from './authHeaders'

/** Catálogo público de planes (7/15/30 días). Sin auth. */
export function getPlanesPublicidad() {
  return api.get('/api/publicidad/planes')
}

/** Crea un destacado PENDIENTE (pago manual v1: pago_ref + aprobación admin). */
export function destacarPublicacion(payload, token) {
  return api.post('/api/publicidad/destacar', payload, conIdempotencia(authHead(token)))
}

/** Historial y estado de destacados del dueño. */
export function getMisDestacados(token) {
  return api.get('/api/publicidad/mias', authHead(token))
}

/** Bandeja admin de destacados PENDIENTE (lista o {items}). */
export function getPublicidadPendientes(token) {
  return api.get('/api/admin/publicidad/pendientes', authHead(token))
}

/** Admin: aprobar o rechazar un destacado ({accion: 'aprobar'|'rechazar'}). */
export function decidirDestacado(id, accion, token) {
  return api.patch(`/api/admin/publicidad/${id}`, { accion }, authHead(token))
}
