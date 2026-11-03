// AdminDashboard - panel maestro /admin/dashboard (solo ADMIN, ver ProtectedAdminRoute).
// a) Métricas globales, b) accesos a moderación (reportes + pendientes),
// c) control maestro por aviso: Aprobar / Rechazar / Eliminar (2 pasos).
// Uso: ruta /admin/dashboard. Ej: métricas {total_publicaciones, pendientes, ...}.
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import BreadcrumbsAdmin from '../components/BreadcrumbsAdmin'
import { Flag, House, Megaphone, ScrollText, Settings, ShieldCheck } from 'lucide-react'
import { authHead } from '../services/authHeaders'
import AjustesSistema from './admin/AjustesSistema'
import HistorialAdmin from './admin/HistorialAdmin'
import PublicidadPendientes from './admin/PublicidadPendientes'
import Stat from './admin/Stat'


export default function AdminDashboard() {
  const { token } = useAuth()
  const [tab, setTab] = useState('moderacion')
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

  const TAB_LABEL = { moderacion: 'Moderación', publicidad: 'Publicidad', ajustes: 'Ajustes del Sistema', historial: 'Historial' }
  return (
    <div className="container-main py-6 md:py-8">
      <BreadcrumbsAdmin actual={TAB_LABEL[tab] || 'Moderación'} volverA="/" volverTexto="Inicio" />
      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1 flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="w-5 h-5" /> Panel Administrador
      </h1>
      <p className="text-xs text-neutral-400 mb-5">Métricas, moderación, avisos y ajustes del sistema.</p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}

      <div className="flex gap-1 border-b border-neutral-150 mb-5" role="tablist" aria-label="Secciones del panel">
        {[
          { id: 'moderacion', label: 'Moderación', icono: ShieldCheck },
          { id: 'publicidad', label: 'Publicidad', icono: Megaphone },
          { id: 'ajustes', label: 'Ajustes del Sistema', icono: Settings },
          { id: 'historial', label: 'Historial', icono: ScrollText },
        ].map((t) => {
          const IconoTab = t.icono
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 -mb-px transition inline-flex items-center gap-1.5 ${tab === t.id
                ? 'border-gold-400 text-navy-900'
                : 'border-transparent text-neutral-400 hover:text-navy-700'
                }`}
            >
              {IconoTab && <IconoTab aria-hidden="true" className="w-4 h-4" />}{t.label}
            </button>
          )
        })}
      </div>

      {tab === 'ajustes' ? (
        <AjustesSistema token={token} />
      ) : tab === 'publicidad' ? (
        <PublicidadPendientes token={token} />
      ) : tab === 'historial' ? (
        <HistorialAdmin token={token} />
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-neutral-150 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Stat label="Alojamientos" value={metricas?.total_publicaciones} tone="navy"
              ayuda="Avisos totales en plataforma (todos los estados, sin cuentas eliminadas)." />
            <Stat label="Usuarios" value={metricas?.total_usuarios} tone="navy"
              ayuda="Cuentas activas registradas (excluye eliminadas)." />
            <Stat
              label="Pendientes de revisión"
              value={metricas?.pendientes}
              tone="amber"
              ayuda={`Avisos en cola de moderación esperando aprobación o rechazo. Denuncias totales acumuladas: ${metricas?.reportes_activos ?? '—'} (pendientes o confirmadas) · Inmuebles con reportes pendientes: ${metricas?.inmuebles_con_reportes ?? '—'} (un mismo aviso puede tener varias denuncias).`}
            />
            <Stat label="Reportes activos" value={metricas?.reportes_activos} tone="red"
              ayuda={`Denuncias pendientes o confirmadas de la comunidad. Inmuebles distintos con pendientes: ${metricas?.inmuebles_con_reportes ?? '—'}.`} />
            <Stat label="Verificados" value={metricas?.arrendadores_verificados} tone="emerald"
              ayuda="Arrendadores con teléfono verificado por un administrador." />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Link
              to="/admin/reportes"
              className="btn-ghost text-xs inline-flex items-center gap-2"
              aria-label={metricas?.reportes_pendientes ? `Bandeja de reportes, ${metricas.reportes_pendientes} pendientes` : 'Bandeja de reportes'}
            >
              <Flag aria-hidden="true" className="w-4 h-4" /> Bandeja de reportes
              {(metricas?.reportes_pendientes ?? 0) > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-600 text-white text-[11px] font-extrabold shadow"
                  aria-label={`${metricas.reportes_pendientes} reportes pendientes`}
                >
                  {metricas.reportes_pendientes}
                </span>
              )}
            </Link>
            <Link to="/admin/tipos-vivienda" className="btn-ghost text-xs inline-flex items-center gap-1.5">
              <House aria-hidden="true" className="w-4 h-4" /> Tipos de vivienda
            </Link>
            <button type="button" onClick={cargar} className="btn-ghost text-xs">Recargar</button>
          </div>

          <h2 className="text-sm font-bold text-navy-800 mb-3">
            Pendientes de revisión {totalPen > 0 && <span className="font-normal text-neutral-400">({totalPen})</span>}
          </h2>
          {pendientes.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-medium text-neutral-700">Sin pendientes</p>
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
