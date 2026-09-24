// servicios.js — Catálogo de servicios para formularios (M4 DRY).
// Fuente única en frontend (los ids 1-5 existen en el seed backend y en
// PublicacionCreate). Si el backend agrega servicios, ampliar aquí.
export const SERVICIOS = [
  { id: 1, nombre: 'WiFi Fibra' },
  { id: 2, nombre: 'Baño Privado' },
  { id: 3, nombre: 'Cocina Compartida' },
  { id: 4, nombre: 'Amoblado' },
  { id: 5, nombre: 'Lavadora' },
]

export function nombresServicios(ids = []) {
  const porId = new Map(SERVICIOS.map((s) => [s.id, s.nombre]))
  return (ids || []).map((id) => porId.get(id) || `Servicio ${id}`)
}
