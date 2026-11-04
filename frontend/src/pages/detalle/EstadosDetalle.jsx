import { Link } from 'react-router-dom'

export function DetalleCargando() {
  return (
    <div className="container-main py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-neutral-150 rounded w-1/2" />
        <div className="h-5 bg-neutral-150 rounded w-1/3" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="h-64 bg-neutral-150 rounded-lg" />
          </div>
          <div className="h-48 bg-neutral-150 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

const TITULO_POR_ERROR = {
  'not-found': 'Esta publicación no se encuentra disponible actualmente',
  '': 'Publicación no encontrada',
}

/** `loadError`: 'not-found' (404), 'network' (otro fallo) o '' (sin datos). */
export function DetalleNoDisponible({ loadError }) {
  const esRed = loadError === 'network'
  return (
    <div className="container-main py-16 text-center">
      <div className="card p-12 max-w-md mx-auto">
        <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-medium text-neutral-700 mb-1">
          {TITULO_POR_ERROR[loadError] ?? 'No se pudo cargar la publicación'}
        </p>
        {loadError === 'not-found' && (
          <p className="text-xs text-neutral-500 mb-4">
            Pudo ser pausada, vendida o eliminada. Explora inmuebles similares en Buscar.
          </p>
        )}
        {esRed && (
          <p className="text-xs text-neutral-500 mb-4">Revisa tu conexión o intenta de nuevo. Si persiste, el servidor puede estar iniciando.</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-2">
          {esRed && (
            <button type="button" onClick={() => window.location.reload()} className="btn-secondary text-sm">
              Reintentar
            </button>
          )}
          <Link to="/" className="text-sm text-navy-600 hover:text-navy-700 font-medium">Volver a buscar</Link>
        </div>
      </div>
    </div>
  )
}
