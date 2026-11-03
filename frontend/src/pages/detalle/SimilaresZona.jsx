// Inmuebles similares disponibles en la misma zona.
import { Link } from 'react-router-dom'























export default function SimilaresZona({ similares }) {
  return (
    <section aria-label="Inmuebles similares disponibles en esta zona" className="mt-10">
      <h2 className="font-display text-lg font-bold text-navy-900 mb-3">
        Inmuebles similares disponibles en esta zona
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {similares.map(s => (
          <Link key={s.id} to={`/publicacion/${s.id}`}
            className="card p-3 hover:border-navy-300 transition block">
            <p className="text-sm font-semibold text-navy-900 line-clamp-1">{s.titulo}</p>
            <p className="text-xs text-neutral-500 mt-1">
              {s.canon_mensual != null ? `$${Number(s.canon_mensual).toLocaleString('es-CO')} COP/mes` : 'Canon no informado'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">{s.zona_nombre || s.zona || ''}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
