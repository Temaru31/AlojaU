// Catálogos públicos (sin token): lugares, ciudades, zonas y la config pública.
// Devuelven `data` y propagan el error: cada pantalla decide su respaldo.
import { api } from './api'
import { fetchConfigPublica } from '../constants'

export async function obtenerCampus() {
  return (await api.get('/api/campus')).data
}

export async function obtenerCiudades() {
  return (await api.get('/api/ciudades')).data
}

export async function obtenerZonas() {
  return (await api.get('/api/zonas')).data
}

/** Config pública (límites, tipos, chat_enabled) con caché local; null si no hay. */
export function obtenerConfigPublica() {
  return fetchConfigPublica(() => api.get('/api/publicaciones/config-publica').then((r) => r.data))
}
