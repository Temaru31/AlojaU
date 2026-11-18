// Asistente de ayuda (explica las funciones de la app; no consulta datos). Con token, el backend usa la identidad
// solo para el límite de uso; sin token es anónimo.
import { api } from './api'
import { bearer } from './authHeaders'

/** Un turno: `{ respuesta, acciones_sugeridas, deshabilitado, ... }`. */
export async function conversar(mensaje, historial, token) {
  const cfg = token ? { headers: bearer(token) } : undefined
  return (await api.post('/api/chat', { mensaje, historial }, cfg)).data || {}
}
