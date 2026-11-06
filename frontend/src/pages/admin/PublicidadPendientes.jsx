// Bandeja admin de destacados pendientes de aprobación.
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getPublicidadPendientes, decidirDestacado } from '../../services/publicidadApi'









// Publicidad v1: bandeja de destacados PENDIENTE (pago manual + aprobación).
// Usa GET /api/admin/publicidad/pendientes y PATCH /api/admin/publicidad/{id}.
export default function PublicidadPendientes({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)

  const cargar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const r = await getPublicidadPendientes(token)
      const d = r.data
      setItems(Array.isArray(d) ? d : (d?.items || []))
    } catch {
      setError('No se pudo cargar la bandeja de publicidad.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const decidir = async (id, accion) => {
    setActing(id)
    setError('')
    try {
      await decidirDestacado(id, accion, token)
      await cargar()
    } catch {
      setError('No se pudo procesar la solicitud.')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return <div className="space-y-2 animate-pulse" aria-label="Cargando destacados pendientes">{[1, 2].map(i => <div key={i} className="h-16 bg-neutral-150 rounded-lg" />)}</div>
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error}</p>}
      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-neutral-700">Sin destacados pendientes</p>
          <p className="text-xs text-neutral-400">Las solicitudes de pago manual aparecerán aquí.</p>
        </div>
      ) : (
        items.map((d) => (
          <article key={d.id} className="card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-800">
                  Destacado #{d.id} · aviso #{d.publicacion_id}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {d.plan_nombre || `plan #${d.plan_id}`} · ref {d.pago_ref || 'sin referencia'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link to={`/publicacion/${d.publicacion_id}`} className="text-xs text-navy-600 hover:underline">Ver aviso</Link>
                <button type="button"
                  onClick={() => decidir(d.id, 'aprobar')}
                  disabled={acting === d.id}
                  aria-label={`Aprobar destacado ${d.id}`}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Aprobar
                </button>
                <button type="button"
                  onClick={() => decidir(d.id, 'rechazar')}
                  disabled={acting === d.id}
                  aria-label={`Rechazar destacado ${d.id}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
