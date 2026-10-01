// utils/alertas — normalización de alertas (Fase 3).
//
// filtrosABusqueda(): mapea los filtros de Buscar ({min,max,tipo,servicios},
// campusId) al contrato POST /api/busquedas-guardadas. Vacío/null = comodín.
// Vive aquí (no en la página) para que la regla Fast-refresh no proteste y
// Buscar + Alertas compartan la misma normalización testeada.
import { parseServicios } from '../components/Filtros'

export const MAX_ALERTAS = 5

export const MENSAJE_SIN_FILTROS =
  '⚠️️ Selecciona al menos un filtro (zona, precio o tipo) para crear una alerta relevante.'

// Anti-spam espejo del backend: sin ningún filtro la alerta matchearía todo.
export function alertaTieneFiltros(body = {}) {
  if (body.zona_barrio_id != null || body.campus_id != null) return true
  if (body.precio_min != null || body.precio_max != null) return true
  if ((body.tipo || '').trim()) return true
  return Array.isArray(body.servicios_ids) && body.servicios_ids.length > 0
}

export function filtrosABusqueda(filtros = {}, campusId = null) {
  const num = (v) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const servicios = parseServicios(filtros.servicios)
    .map((s) => Number(s)).filter((n) => Number.isInteger(n) && n >= 1)
  return {
    precio_min: num(filtros.min),
    precio_max: num(filtros.max),
    campus_id: Number.isInteger(campusId) && campusId >= 1 ? campusId : null,
    tipo: (filtros.tipo || '').trim().toUpperCase() || null,
    servicios_ids: servicios,
  }
}
