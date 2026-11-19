// persistenciaBuscar — el filtro de ubicación es GLOBAL (Buscar ↔ Comparar)
// y la búsqueda sobrevive a navegar/volver.
//
// - Campus (localStorage `alojau_campus_filtro`): Buscar lo escribe al cambiar;
//   Comparar lo lee porque vive en otra ruta (`/comparar`) y sus propios
//   `?campus_id=` se pierden al navegar desde `/`. Si la URL trae el param,
//   manda la URL y se re-sincroniza el storage.
// - Filtros (sessionStorage `alojau_buscar_filtros`): snapshot {filtros,
//   campus_id, ciudad_id, q} que Buscar restaura cuando se llega a `/` sin
//   params (clic en "Buscar" del navbar, volver desde otra zona). El botón
//   atrás nativo ya conserva params por historial; esto cubre el resto.
//   "Limpiar" borra el snapshot. sessionStorage (no local): por pestaña.

export const CAMPUS_FILTRO_KEY = 'alojau_campus_filtro'
export const BUSCAR_FILTROS_KEY = 'alojau_buscar_filtros'

function leerStorage(tipo, clave) {
  try {
    const store = tipo === 'local' ? localStorage : sessionStorage
    return store.getItem(clave)
  } catch {
    return null
  }
}

function escribirStorage(tipo, clave, valor) {
  try {
    const store = tipo === 'local' ? localStorage : sessionStorage
    if (valor == null || valor === '') store.removeItem(clave)
    else store.setItem(clave, String(valor))
  } catch { /* modo privado: sin persistencia, sin romper */ }
}

/** Campus global para Comparar (string id o '' sin filtro). */
export function guardarCampusFiltro(id) {
  escribirStorage('local', CAMPUS_FILTRO_KEY, id ?? '')
}

export function leerCampusFiltro() {
  const v = leerStorage('local', CAMPUS_FILTRO_KEY)
  return v != null && v !== '' ? v : ''
}

/**
 * Resuelve el campus efectivo SIN efectos secundarios (apto para render):
 * la URL manda; si no trae, el último filtro global guardado.
 * Para persistir un cambio, usar guardarCampusFiltro() en un handler/efecto.
 */
export function resolverCampusId(paramUrl) {
  if (paramUrl != null && paramUrl !== '' && Number(paramUrl) >= 1) {
    return String(paramUrl)
  }
  const guardado = leerCampusFiltro()
  return guardado && Number(guardado) >= 1 ? guardado : ''
}

/** Snapshot de la búsqueda {filtros:{min,max,tipo,servicios}, campus_id, ciudad_id, q}. */
export function guardarFiltrosBuscar(snap) {
  try {
    sessionStorage.setItem(BUSCAR_FILTROS_KEY, JSON.stringify(snap))
  } catch { /* noop */ }
}

export function leerFiltrosBuscar() {
  try {
    const raw = sessionStorage.getItem(BUSCAR_FILTROS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    return p
  } catch {
    return null
  }
}

export function limpiarFiltrosBuscar() {
  try { sessionStorage.removeItem(BUSCAR_FILTROS_KEY) } catch { /* noop */ }
}
