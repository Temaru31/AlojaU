// Historial del inmueble (solo el dueño ve su trazabilidad).
import { formatearSesionFecha } from '../../utils/sesion'
import { etiquetaEvento } from '../../utils/historial'



export default function HistorialInmueble({ historial }) {
  return (
    <section aria-label="Historial del inmueble" className="mt-10">
      <h2 className="font-display text-lg font-bold text-navy-900 mb-3">
        Historial del inmueble
      </h2>
      <ul className="card divide-y divide-neutral-100">
        {historial.map(h => (
          <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="font-semibold text-navy-800 shrink-0 min-w-24">
              {etiquetaEvento(h.evento)}
            </span>
            <span className="text-neutral-400 ml-auto shrink-0">
              {formatearSesionFecha(h.creado_en) || 'fecha desconocida'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
