// Avisos (publicaciones): detalle, panel del dueño y edición. Devuelven `data`;
// los errores son los de axios (`err.response.status/detail`), sin traducir.
// `signal` (AbortController) es opcional en las lecturas que se cancelan.
import { api, conIdempotencia } from './api'
import { authHead, bearer } from './authHeaders'

const conToken = (token, extra = {}) => ({ ...(token ? authHead(token) : {}), ...extra })

/** Detalle de un aviso; con token, el dueño/ADMIN ve también los no ACTIVO. */
export async function obtenerPublicacion(id, { token, signal, query = '' } = {}) {
  const cfg = conToken(token, signal ? { signal } : {})
  return (await api.get(`/api/publicaciones/${id}${query}`, cfg)).data
}

/** Avisos del dueño (todos los estados). `params`: page, size, estado, orden. */
export async function listarMisPublicaciones(token, params = {}, { signal } = {}) {
  const cfg = { params, headers: bearer(token), ...(signal ? { signal } : {}) }
  return (await api.get('/api/publicaciones/mias', cfg)).data
}

/** Total de avisos del dueño (opcionalmente por estado), sin traer filas. */
export async function contarMisPublicaciones(token, estado) {
  const data = await listarMisPublicaciones(token, { size: 1, ...(estado ? { estado } : {}) })
  return data?.total
}

export async function historialMisAvisos(token, { size = 10, signal } = {}) {
  const cfg = { params: { size }, headers: bearer(token), ...(signal ? { signal } : {}) }
  return (await api.get('/api/publicaciones/mias/historial', cfg)).data || {}
}

/** Pausa/reanuda (ACTIVO <-> PAUSADO). Devuelve `{ estado, rol_actualizado, ... }`. */
export async function cambiarEstadoPublicacion(id, estado, token) {
  return (await api.patch(`/api/publicaciones/${id}/estado`, { estado }, { headers: bearer(token) })).data
}

export async function eliminarPublicacion(id, token) {
  return (await api.delete(`/api/publicaciones/${id}`, { headers: bearer(token) })).data
}

export async function editarPublicacion(id, cambios, token) {
  return (await api.patch(`/api/publicaciones/${id}`, cambios, authHead(token))).data
}

/** Sube UNA foto al storage (sin vincularla al aviso); devuelve sus URLs. */
export async function subirUnaFoto(archivo, token) {
  const fd = new FormData()
  fd.append('file', archivo)
  const head = authHead(token)
  const r = await api.post('/api/publicaciones/upload/una', fd, {
    ...head,
    headers: { ...head.headers, 'Content-Type': 'multipart/form-data' },
  })
  return r.data?.urls || []
}

/** Publica un aviso (queda PENDIENTE). Idempotente: un reintento no lo duplica. */
export async function crearPublicacion(payload, token) {
  return (await api.post('/api/publicaciones', payload, conIdempotencia(authHead(token)))).data
}

/** Reporte anónimo de un aviso (motivo + detalle opcional). */
export function reportarPublicacion(publicacionId, motivo, detalle) {
  return api.post('/api/reportes', { publicacion_id: Number(publicacionId), motivo, detalle: detalle || undefined })
}

/** Búsqueda pública paginada (`params`: filtros, page, size, orden). */
export async function buscarPublicaciones(params, { signal } = {}) {
  return (await api.get('/api/publicaciones', { params, ...(signal ? { signal } : {}) })).data
}

/** Renueva la vigencia 30 días (solo el dueño). */
export async function renovarPublicacion(id, token) {
  return (await api.patch(`/api/publicaciones/${id}/renovar`, {}, authHead(token))).data
}

/** Avisos parecidos en la misma zona (lista; vacía si no hay). */
export async function similaresDe(id, { limit = 4 } = {}) {
  const data = (await api.get(`/api/publicaciones/${id}/similares`, { params: { limit } })).data
  return Array.isArray(data?.items) ? data.items : []
}

/** Historial del aviso (solo el dueño lo recibe). */
export async function historialDeAviso(id, token) {
  const data = (await api.get(`/api/publicaciones/${id}/historial`, { headers: bearer(token) })).data
  return Array.isArray(data?.items) ? data.items : []
}

/** Métrica de vistas (best-effort: nunca rechaza). */
export function registrarVista(id) {
  const p = api.post(`/api/publicaciones/${id}/vista`)
  return p?.catch?.(() => { /* métrica best-effort */ })
}
