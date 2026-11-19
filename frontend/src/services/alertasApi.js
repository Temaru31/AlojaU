// Búsquedas guardadas (alertas de nuevos arriendos). Los componentes usan
// estas funciones, no la URL: si cambia el endpoint, se toca solo aquí.
import { api } from './api'
import { bearer } from './authHeaders'
import { obtenerCampus } from './catalogosApi'

const RUTA = '/api/busquedas-guardadas'

/** Alertas del usuario (activas e inactivas), recientes primero. */
export async function listarAlertas(token) {
  const r = await api.get(RUTA, { headers: bearer(token) })
  return Array.isArray(r.data) ? r.data : []
}

/** Crea una alerta; devuelve la alerta guardada. 422 si no tiene filtros o hay tope. */
export async function crearAlerta(body, token) {
  const r = await api.post(RUTA, body, { headers: bearer(token) })
  return r.data
}

export function eliminarAlerta(id, token) {
  return api.delete(`${RUTA}/${id}`, { headers: bearer(token) })
}

/** Catálogo de lugares para el selector; si falla, lista vacía (no bloquea la página). */
export async function listarCampus() {
  try {
    const lista = await obtenerCampus()
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}
