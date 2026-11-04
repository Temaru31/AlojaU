// Actividad del visitante guardada en este navegador (sin backend): avisos
// contactados y vistos recientemente. AuthContext borra estas claves al
// cerrar sesión (SESION_KEYS). Todo es best-effort: sin storage, no falla.
const CLAVE_CONTACTOS = 'alojau_contactos'
const CLAVE_VISTOS = 'alojau_historial'

function leerLista(clave) {
  try {
    const parsed = JSON.parse(localStorage.getItem(clave) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function leerContactos() {
  return leerLista(CLAVE_CONTACTOS)
}

/** Marca el aviso como contactado (máx. 100, sin duplicados). Devuelve la lista. */
export function guardarContacto(id, titulo) {
  try {
    const prev = leerContactos()
    if (prev.some(c => c.id === id)) return prev
    const next = [...prev, { id, titulo: titulo || '', fecha: new Date().toISOString() }]
    localStorage.setItem(CLAVE_CONTACTOS, JSON.stringify(next.slice(-100)))
    return next
  } catch {
    return []
  }
}

/** Pone el aviso al inicio de "vistos recientemente" (máx. 30, sin duplicados). */
export function registrarVisto(pub) {
  try {
    const lista = leerLista(CLAVE_VISTOS).filter(h => h.id !== pub.id)
    lista.unshift({ id: pub.id, titulo: pub.titulo || '', fecha: new Date().toISOString() })
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify(lista.slice(0, 30)))
  } catch { /* historial opcional */ }
}
