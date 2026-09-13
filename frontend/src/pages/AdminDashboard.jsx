// AdminDashboard - panel maestro /admin/dashboard (solo ADMIN, ver ProtectedAdminRoute).
// a) Métricas globales, b) accesos a moderación (reportes + pendientes),
// c) control maestro por aviso: Aprobar / Rechazar / Eliminar (2 pasos).
// Uso: ruta /admin/dashboard. Ej: métricas {total_publicaciones, pendientes, ...}.
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const authHead = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

function Stat({ label, value, tone }) {
  const tones = {
    navy: 'bg-navy-50 border-navy-100 text-navy-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone] || tones.navy}`}>
      <p className="text-2xl font-extrabold">{value ?? '—'}</p>
      <p className="text-[11px] font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const { token } = useAuth()
  const [metricas, setMetricas] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [totalPen, setTotalPen] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const cargar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [m, p] = await Promise.all([
        api.get('/api/admin/metricas', authHead(token)),
        api.get('/api/admin/pendientes', { params: { size: 10 }, ...authHead(token) }),
      ])
      setMetricas(m.data)
      setPendientes(p.data.items || [])
      setTotalPen(p.data.total || 0)
    } catch (err) {
      setError(err?.response?.status === 401 || err?.response?.status === 403
        ? 'Sin permiso de administrador.'
        : 'No se pudo cargar el panel.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const cambiarEstado = async (id, estado) => {
    setActing(id)
    setError('')
    try {
      await api.patch(`/api/admin/publicaciones/${id}`, { estado }, authHead(token))
      await cargar()
    } catch {
      setError('No se pudo cambiar el estado.')
    } finally {
      setActing(null)
    }
  }

  const eliminar = async (id) => {
    setActing(id)
    setError('')
    try {
      await api.delete(`/api/admin/publicaciones/${id}`, authHead(token))
      setConfirmDel(null)
      await cargar()
    } catch {
      setError('No se pudo eliminar.')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Panel admin</span>
      </nav>
      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1">
        🛡️ Panel Administrador
      </h1>
      <p className="text-xs text-neutral-400 mb-5">Métricas, moderación y control maestro de avisos.</p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-neutral-150 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Alojamientos" value={metricas?.total_publicaciones} tone="navy" />
            <Stat label="Pendientes" value={metricas?.pendientes} tone="amber" />
            <Stat label="Reportes activos" value={metricas?.reportes_activos} tone="red" />
            <Stat label="Verificados" value={metricas?.arrendadores_verificados} tone="emerald" />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Link to="/admin/reportes" className="btn-ghost text-xs">
              🚩 Bandeja de reportes{metricas?.reportes_pendientes ? ` (${metricas.reportes_pendientes})` : ''}
            </Link>
            <button type="button" onClick={cargar} className="btn-ghost text-xs">Recargar</button>
          </div>

          <h2 className="text-sm font-bold text-navy-800 mb-3">
            Pendientes de revisión {totalPen > 0 && <span className="font-normal text-neutral-400">({totalPen})</span>}
          </h2>
          {pendientes.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-medium text-neutral-700">Sin pendientes 🎉</p>
              <p className="text-xs text-neutral-400">No hay avisos por revisar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendientes.map((p) => (
                <article key={p.id} className="card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy-800 truncate">{p.titulo}</p>
                      <p className="text-[11px] text-neutral-400">
                        #{p.id} · {p.canon_mensual != null ? `$${Number(p.canon_mensual).toLocaleString('es-CO')}` : 's/canon'} · dueño #{p.usuario_id} · confianza {p.indice_confianza ?? 0}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link to={`/publicacion/${p.id}`} className="text-xs text-navy-600 hover:underline">Ver</Link>
                      <button type="button"
                        onClick={() => cambiarEstado(p.id, 'ACTIVO')}
                        disabled={acting === p.id}
                        aria-label={`Aprobar aviso ${p.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                      <button type="button"
                        onClick={() => cambiarEstado(p.id, 'RECHAZADO')}
                        disabled={acting === p.id}
                        aria-label={`Rechazar aviso ${p.id}`}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      {confirmDel === p.id ? (
                        <>
                          <button type="button"
                            onClick={() => eliminar(p.id)}
                            disabled={acting === p.id}
                            aria-label={`Confirmar eliminar aviso ${p.id}`}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button type="button" onClick={() => setConfirmDel(null)} className="text-xs text-neutral-500 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button type="button"
                          onClick={() => setConfirmDel(p.id)}
                          aria-label={`Eliminar aviso ${p.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
