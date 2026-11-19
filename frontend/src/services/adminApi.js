// Panel de administración: métricas, moderación, reportes, tipos de vivienda,
// ajustes y auditoría. Devuelven `data`; los errores son los de axios.
import { api } from './api'
import { authHead, bearer } from './authHeaders'

export async function obtenerMetricas(token) {
  return (await api.get('/api/admin/metricas', authHead(token))).data
}

/** Cola de moderación: `{ items, total, ... }`. */
export async function listarPendientes(token, { size = 10 } = {}) {
  return (await api.get('/api/admin/pendientes', { params: { size }, ...authHead(token) })).data
}

/** Aprobar/rechazar/pausar un aviso (`estado`: ACTIVO | RECHAZADO | PAUSADO). */
export function moderarPublicacion(id, estado, token) {
  return api.patch(`/api/admin/publicaciones/${id}`, { estado }, authHead(token))
}

export function eliminarPublicacionAdmin(id, token) {
  return api.delete(`/api/admin/publicaciones/${id}`, authHead(token))
}

export async function listarReportesPendientes(token, { signal } = {}) {
  return (await api.get('/api/reportes', { params: { estado: 'PENDIENTE' }, headers: bearer(token), signal })).data
}

/** Resolver un reporte (`accion`: confirmar | descartar). */
export function resolverReporte(id, accion, token) {
  return api.patch(`/api/reportes/${id}`, { accion }, { headers: bearer(token) })
}

export async function listarTiposVivienda(token) {
  const data = (await api.get('/api/admin/housing-types', authHead(token))).data
  return Array.isArray(data) ? data : []
}

export function crearTipoVivienda(tipo, token) {
  return api.post('/api/admin/housing-types', tipo, authHead(token))
}

/** Edición parcial de un tipo; devuelve el tipo actualizado. */
export async function editarTipoVivienda(slug, cambios, token) {
  return (await api.patch(`/api/admin/housing-types/${slug}`, cambios, authHead(token))).data
}

export function eliminarTipoVivienda(slug, token) {
  return api.delete(`/api/admin/housing-types/${slug}`, authHead(token))
}

export async function listarAjustes(token) {
  return (await api.get('/api/admin/automation/settings', authHead(token))).data
}

/** Guarda un ajuste; devuelve el ajuste actualizado. */
export async function guardarAjuste(clave, valor, token) {
  return (await api.patch(`/api/admin/automation/settings/${clave}`, { valor: String(valor ?? '') }, authHead(token))).data
}

/** Log de auditoría paginado: `{ items, total, ... }`. */
export async function listarAuditoria(token, { page, size }) {
  return (await api.get('/api/admin/auditoria', { params: { page, size }, ...authHead(token) })).data
}
