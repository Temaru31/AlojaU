// Historial de auditoría admin (paginado).
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatearSesionFecha } from '../../utils/sesion'
import { etiquetaEvento, describirAuditoria } from '../../utils/historial'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listarAuditoria } from '../../services/adminApi'

// Historial de cambios (usa GET /api/admin/auditoria existente).
export default function HistorialAdmin({ token }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const SIZE = 15

  const cargar = useCallback(async (p) => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const datos = await listarAuditoria(token, { page: p, size: SIZE })
      setItems(datos?.items || [])
      setTotal(datos?.total || 0)
      setPages(Math.max(1, Math.ceil((datos?.total || 0) / SIZE)))
    } catch {
      setError('No se pudo cargar el historial.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar(page) }, [cargar, page])

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error}</p>}
      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Cargando historial">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-neutral-150 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-neutral-700">Sin actividad registrada</p>
          <p className="text-xs text-neutral-400">Las aprobaciones, ajustes y eliminaciones aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(a => {
              const legible = describirAuditoria(a)
              const pid = a.publicacion_id
              // Publicación eliminada -> texto plano sin link (hard delete CASCADE).
              const puedeLinkear = pid != null && a.publicacion_existe !== false
              return (
                <li key={a.id} className="card p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs font-bold text-navy-800 shrink-0 min-w-32">
                    {etiquetaEvento(a.evento)}
                  </span>
                  <span className="text-xs text-neutral-600 flex-1 min-w-0" title={a.detalle || legible}>
                    {legible}
                    {a.usuario_email && (
                      <span className="block text-[11px] text-neutral-400 truncate" title={a.usuario_email}>
                        por {a.usuario_email}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-400 shrink-0">
                    {pid != null ? (
                      puedeLinkear ? (
                        <Link
                          to={`/publicacion/${pid}`}
                          className="text-navy-600 underline decoration-navy-300 underline-offset-2 hover:text-navy-800"
                          aria-label={`Abrir aviso #${pid}`}
                        >
                          aviso #{pid}
                        </Link>
                      ) : (
                        <span title="Aviso eliminado">aviso #{pid} (eliminado)</span>
                      )
                    ) : null}
                    {pid != null ? ' · ' : ''}
                    {formatearSesionFecha(a.creado_en) || 'fecha desconocida'}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-200 disabled:opacity-40 inline-flex items-center gap-1">
              <ChevronLeft aria-hidden="true" className="w-4 h-4" /> Anterior
            </button>
            <span className="text-xs text-neutral-500">Página {page} de {pages} ({total})</span>
            <button type="button" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-200 disabled:opacity-40 inline-flex items-center gap-1">
              Siguiente <ChevronRight aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
