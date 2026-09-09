// AdminReportes - bandeja de denuncias PENDIENTES (HU-010B, solo ADMIN).
// Uso: ruta /admin/reportes. Ej: confirmar -> CONFIRMADO, descartar -> DESCARTADO.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

const MOTIVO_LABEL = {
  POSIBLE_ESTAFA: 'Posible estafa',
  DATOS_FALSOS: 'Datos falsos',
  INMUEBLE_ARRENDADO: 'Ya arrendado',
  FOTOS_ENGANOSAS: 'Fotos engañosas',
  OTRO: 'Otro',
}

export default function AdminReportes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)

  const cargar = async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('alojau_token') || ''
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const r = await api.get('/api/reportes', { params: { estado: 'PENDIENTE' }, headers })
      setItems(r.data)
    } catch (err) {
      const status = err?.response?.status
      setError(
        status === 401 ? 'Inicia sesión para ver esta página.'
        : status === 403 ? 'Solo administradores (rol ADMIN).'
        : 'No se pudo cargar la bandeja.'
      )
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const actuar = async (id, accion) => {
    setActing(id)
    setError('')
    try {
      const token = localStorage.getItem('alojau_token') || ''
      await api.patch(`/api/reportes/${id}`, { accion }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setItems((prev) => prev.filter((x) => x.id !== id))
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo actualizar el reporte.')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Reportes pendientes</span>
      </nav>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900">
          Reportes pendientes {items.length > 0 && <span className="text-sm font-normal text-neutral-400">({items.length})</span>}
        </h1>
        <button onClick={cargar} className="btn-ghost text-xs">Recargar</button>
      </div>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3" role="alert">{error}</p>}

      {loading ? (
        <div className="card p-6 animate-pulse space-y-3">
          <div className="h-4 bg-neutral-150 rounded w-1/3" />
          <div className="h-4 bg-neutral-150 rounded w-2/3" />
        </div>
      ) : items.length === 0 && !error ? (
        <div className="card p-12 text-center">
          <p className="text-sm font-medium text-neutral-700 mb-1">Sin pendientes</p>
          <p className="text-xs text-neutral-400">No hay reportes por revisar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-800">
                  #{r.id} · {MOTIVO_LABEL[r.motivo] || r.motivo}
                  <Link to={`/publicacion/${r.publicacion_id}`} className="ml-2 text-xs font-normal text-navy-600 hover:underline">
                    ver aviso #{r.publicacion_id}
                  </Link>
                </p>
                {r.detalle && <p className="text-xs text-neutral-500 mt-1 break-words">{r.detalle}</p>}
                <p className="text-[11px] text-neutral-400 mt-1">
                  {r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleString('es-CO') : ''} · {r.usuario_id ? `usuario #${r.usuario_id}` : 'anónimo'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => actuar(r.id, 'descartar')}
                  disabled={acting === r.id}
                  aria-label={`Descartar reporte ${r.id}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Descartar
                </button>
                <button
                  onClick={() => actuar(r.id, 'confirmar')}
                  disabled={acting === r.id}
                  aria-label={`Confirmar reporte ${r.id}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {acting === r.id ? '…' : 'Confirmar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
