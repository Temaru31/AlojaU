/**
 * BadgeConfianza — píldora minimalista compartida (Tarea 2 v7 / Tarea 1 v8).
 * Solo punto de color + número sobre fondo oscuro traslúcido; el detalle
 * ("Confianza Alta: 100/100") vive en el tooltip nativo y el aria-label.
 * Uso: <BadgeConfianza indice={95} />. Ej: Card, Comparar.
 */

const NIVELES = {
  alto: { punto: '🟢', etiqueta: 'Confianza Alta' },
  medio: { punto: '🟡', etiqueta: 'Confianza Media' },
  bajo: { punto: '🔴', etiqueta: 'Confianza Básica' },
}

export function nivelConfianza(indice) {
  const n = Number(indice) || 0
  if (n >= 80) return 'alto'
  if (n >= 50) return 'medio'
  return 'bajo'
}

export default function BadgeConfianza({ indice = 0 }) {
  const n = Number(indice) || 0
  const nivel = nivelConfianza(n)
  const { punto, etiqueta } = NIVELES[nivel]
  return (
    <div
      className="inline-flex items-center gap-1 backdrop-blur-md bg-black/40 text-white font-semibold px-2 py-0.5 rounded-full text-xs"
      title={`${etiqueta}: ${n}/100`}
      aria-label={`${etiqueta}: ${n} de 100`}
    >
      <span aria-hidden="true">{punto}</span> {n}
    </div>
  )
}
