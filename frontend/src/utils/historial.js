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
