// BreadcrumbsAdmin — Navegación jerárquica unificada M1.
// Desktop: Inicio › Panel Admin › [Pestaña / Sub-vista].
// Móvil (<640px, `sm:hidden`): colapsa a botón compacto `← Volver al Panel`
// (o `← Inicio` cuando ya estamos en el panel raíz).
// Uso:
//   <BreadcrumbsAdmin actual="Moderación" />
//   <BreadcrumbsAdmin actual="Reportes" volverA="/admin/dashboard" volverTexto="Volver al Panel" />
import { Link } from 'react-router-dom'

export default function BreadcrumbsAdmin({ actual, volverA = '/', volverTexto = 'Inicio' }) {
  return (
    <>
      {/* Desktop / tablet: trail completo */}
      <nav aria-label="Migas de pan" className="hidden sm:flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Inicio</Link>
        <span aria-hidden="true">›</span>
        <Link to="/admin/dashboard" className="hover:text-navy-600">Panel Admin</Link>
        {actual && (
          <>
            <span aria-hidden="true">›</span>
            <span className="text-neutral-600" aria-current="page">{actual}</span>
          </>
        )}
      </nav>
      {/* Móvil <640px: botón compacto */}
      <div className="sm:hidden mb-4">
        <Link
          to={volverA}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 border border-navy-200 rounded-full px-3 py-2 min-h-[44px]"
          aria-label={`Volver al ${volverTexto}`}
        >
          <span aria-hidden="true">←</span> Volver al {volverTexto}
        </Link>
      </div>
    </>
  )
}
