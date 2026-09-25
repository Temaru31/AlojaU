// historial.js — Etiquetas humanas para eventos de auditoría (M4).
// Fuente única para el Historial admin y el Historial del inmueble.
// Nunca se muestra el enum crudo de BD al usuario.

export const EVENTO_LABEL = {
  CREATED: 'Creada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
  RESUMED: 'Reanudada',
  RENTED: 'Arrendada',
  EXPIRED: 'Expirada',
  RENEWED: 'Renovada',
  BLOCKED: 'Bloqueada',
  SETTINGS: 'Ajuste del sistema',
  CUENTA_DELETE: 'Cuenta eliminada',
}

export function etiquetaEvento(evento) {
  return EVENTO_LABEL[evento] || evento || 'Evento'
}

// M1 human-readable enriquecido: convierte el log crudo en frase amigable.
// Ej. {evento:'RENEWED', publicacion_id:14} -> "Renovó expiración del aviso #14".
// Si el backend ya envía `mensaje_legible`, se prefiere tal cual (contrato aditivo).
export const MENSAJE_AUDITORIA = {
  CREATED: (pid) => (pid != null ? `Creó el aviso #${pid}` : 'Creó un aviso'),
  APPROVED: (pid) => (pid != null ? `Aprobó el aviso #${pid}` : 'Aprobó un aviso'),
  REJECTED: (pid) => (pid != null ? `Rechazó el aviso #${pid}` : 'Rechazó un aviso'),
  PAUSED: (pid) => (pid != null ? `Pausó el aviso #${pid}` : 'Pausó un aviso'),
  RESUMED: (pid) => (pid != null ? `Reanudó el aviso #${pid}` : 'Reanudó un aviso'),
  RENTED: (pid) => (pid != null ? `Marcó como arrendado el aviso #${pid}` : 'Marcó un aviso como arrendado'),
  EXPIRED: (pid) => (pid != null ? `Expiró el aviso #${pid}` : 'Expiró un aviso'),
  RENEWED: (pid) => (pid != null ? `Renovó expiración del aviso #${pid}` : 'Renovó un aviso'),
  BLOCKED: (pid) => (pid != null ? `Bloqueó el aviso #${pid}` : 'Bloqueó un aviso'),
  SETTINGS: () => 'Actualizó ajustes del sistema',
  CUENTA_DELETE: () => 'Eliminó su cuenta',
}

export function describirAuditoria(a = {}) {
  if (a.mensaje_legible) return a.mensaje_legible
  const fn = MENSAJE_AUDITORIA[a.evento]
  if (fn) return fn(a.publicacion_id)
  const det = (a.detalle || '').trim()
  if (det) {
    const limpio = det.replace(/[{}"]/g, '').trim().slice(0, 140)
    return `${etiquetaEvento(a.evento)}${a.publicacion_id != null ? ` #${a.publicacion_id}` : ''}${limpio ? `: ${limpio}` : ''}`
  }
  return `${etiquetaEvento(a.evento)}${a.publicacion_id != null ? ` #${a.publicacion_id}` : ''}`
}
