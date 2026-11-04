// Estados de publicación: espejo de backend/app/core/dominio.py::EstadoPublicacion.
// Fuente única de valores y de etiquetas amigables (nunca se muestra el enum crudo).

export const ESTADO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  ACTIVO: 'ACTIVO',
  PAUSADO: 'PAUSADO',
  PAUSADO_POR_REPORTE: 'PAUSADO_POR_REPORTE',
  REVISION_REQUERIDA: 'REVISION_REQUERIDA',
  RECHAZADO: 'RECHAZADO',
  ARRENDADO: 'ARRENDADO',
  EXPIRADO: 'EXPIRADO',
  DESACTIVADO: 'DESACTIVADO',
})

// La pausa del dueño se distingue de la pausa por moderación: el arrendador
// debe saber por qué su aviso no se ve.
export const ESTADO_LABEL = Object.freeze({
  [ESTADO.ACTIVO]: 'Publicada',
  [ESTADO.PENDIENTE]: 'En revisión',
  [ESTADO.EXPIRADO]: 'Vencida',
  [ESTADO.PAUSADO]: 'Pausada por el Arrendador',
  [ESTADO.PAUSADO_POR_REPORTE]: 'Pausada por Moderación',
  [ESTADO.REVISION_REQUERIDA]: 'En revisión de Moderación',
  [ESTADO.RECHAZADO]: 'Rechazada',
  [ESTADO.ARRENDADO]: 'Arrendada',
  [ESTADO.DESACTIVADO]: 'Desactivada',
})

/** Etiqueta amigable de un estado, o el valor tal cual si es desconocido. */
export const etiquetaEstado = (estado) => ESTADO_LABEL[estado] || estado
