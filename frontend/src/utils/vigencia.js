// Vigencia de un aviso: días restantes, nivel de alerta y fecha legible.


















/**
 * Reglas de cálculo de días de vigencia:
 * - Faltan más de 1 día: "X días restantes" (ej. "10 días restantes")
 * - Falta 1 día: "1 día restante"
 * - Vence durante el día actual: "Vence hoy"
 * - La expiración ya pasó: "Vencida" (o "No vigente")
 */
export function calcularVigencia(fechaRaw, ahora = new Date()) {
  if (!fechaRaw) return null
  const exp = new Date(fechaRaw)
  if (isNaN(exp.getTime())) return null

  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const vence = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate())
  const diffDias = Math.round((vence.getTime() - hoy.getTime()) / 86_400_000)
  const msDiff = exp.getTime() - ahora.getTime()

  // Si la fecha ya expiró (días negativos o timestamp en el pasado)
  if (diffDias < 0 || msDiff < 0) {
    return {
      texto: 'Vencida',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      dias: diffDias,
      vencida: true,
    }
  }

  // Vence durante el día actual
  if (diffDias === 0) {
    return {
      texto: 'Vence hoy',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dias: 0,
      venceHoy: true,
    }
  }

  // Falta exactamente 1 día
  if (diffDias === 1) {
    return {
      texto: '1 día restante',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dias: 1,
      vigente: true,
    }
  }

  // Faltan más de 1 día (ej. 10 días restantes)
  return {
    texto: `${diffDias} días restantes`,
    badgeClass: diffDias <= 5 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dias: diffDias,
    vigente: true,
  }
}

/** Formatea fecha de expiración en texto legible */
export function formatFechaExpiracion(fechaRaw) {
  if (!fechaRaw) return null
  const d = new Date(fechaRaw)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}
