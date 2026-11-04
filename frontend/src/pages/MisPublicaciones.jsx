// MisPublicaciones - bandeja de gestión del propietario (UX navbar: "Mis Publicaciones").
// Muestra exclusivamente las publicaciones del usuario autenticado vía GET /api/publicaciones/mias.
// Cada tarjeta presenta imagen, título, tipo, zona, canon, estado, fecha de expiración,
// cálculo de días restantes según reglas de vigencia y botón de renovación.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { isCancelError } from '../services/api'
import { mensajeDeError } from '../services/erroresApi'
import { useAuth, emitMiasChange } from '../contexts/AuthContext'
import Paginacion from '../components/Paginacion'
import ConfirmDialog from '../components/ConfirmDialog'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import RenovarModal from '../components/RenovarModal'
import HistorialAvisos from '../components/HistorialAvisos'
import useTiposVivienda from '../hooks/useTiposVivienda'
import { ESTADO } from '../utils/estados'
import TarjetaMiAviso from './misPublicaciones/TarjetaMiAviso'
import { cambiarEstadoPublicacion, eliminarPublicacion, listarMisPublicaciones } from '../services/publicacionesApi'

// Orden del panel (server-side vía ?orden=: ordenar en cliente mentiría
// con paginación multipágina).
const ORDENES_MIS_PUBS = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'vistas', label: 'Más vistas' },
  { value: 'estado', label: 'Estado' },
]

const FILTROS = [
  { value: '', label: 'Todas' },
  { value: ESTADO.ACTIVO, label: 'Publicadas' },
  { value: ESTADO.PENDIENTE, label: 'En revisión' },
  { value: ESTADO.PAUSADO, label: 'Pausadas' },
  { value: ESTADO.EXPIRADO, label: 'Vencidas' },
]

const PAGE_SIZE = 12

export default function MisPublicaciones() {
  const { token, refresh, user } = useAuth()
  // Catálogo dinámico con fallback estático.
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editando, setEditando] = useState(null)
  const [renovando, setRenovando] = useState(null)
  // Borrado con modal independiente (nunca cambia el texto del botón).
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  // Switch ACTIVA/PAUSADA del dueño.
  const [cambiandoEstado, setCambiandoEstado] = useState(null)
  // Pausar oculta la vitrina -> confirmación en 2 pasos (reanudar no).
  const [aPausar, setAPausar] = useState(null)
  // Orden server-side (se envía al backend y resetea la página).
  const [orden, setOrden] = useState('recientes')

  const handleEstado = async (p) => {
    if (p.estado === ESTADO.ACTIVO && aPausar !== p.id) {
      setAPausar(p.id)
      return
    }
    const nuevo = p.estado === ESTADO.ACTIVO ? ESTADO.PAUSADO : ESTADO.ACTIVO
    setCambiandoEstado(p.id)
    setError('')
    try {
      const r = await cambiarEstadoPublicacion(p.id, nuevo, token)
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, estado: r?.estado || nuevo } : x))
      setAPausar(null)
      if (r?.rol_actualizado) {
        try { await refresh?.() } catch { /* noop */ }
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado.'))
      setAPausar(null)
    } finally {
      setCambiandoEstado(null)
    }
  }

  const handleEliminar = async (p) => {
    setEliminando(true)
    setError('')
    try {
      const r = await eliminarPublicacion(p.id, token)
      setItems(prev => prev.filter(x => x.id !== p.id))
      setTotal(t => Math.max(0, t - 1))
      setAEliminar(null)
      // El navbar oculta "Mis publicaciones" al llegar a 0 avisos.
      emitMiasChange()
      // Reactividad de rol: si hubo democión, re-sincroniza el perfil.
      if (r?.rol_actualizado) {
        try { await refresh?.() } catch { /* noop */ }
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la publicación.'))
      setAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  // AbortController — cambiar de filtro/página aborta la petición anterior
  // para que una respuesta tardía no pise los resultados actuales.
  useEffect(() => {
    if (!token) {
      setItems([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listarMisPublicaciones(token,
      { page, size: PAGE_SIZE, ...(filtro ? { estado: filtro } : {}), orden },
      { signal: controller.signal })
      .then(data => {
        if (Array.isArray(data)) {
          setItems(data); setTotal(data.length); setPages(1)
        } else {
          setItems(data.items || []); setTotal(data.total || 0); setPages(data.pages || 1)
        }
      })
      .catch(err => {
        if (isCancelError(err) || controller.signal.aborted) return
        const status = err?.response?.status
        setError(status === 401
          ? 'Sesión vencida. Inicia sesión de nuevo.'
          : status === 404 || status === 422
            ? 'Tu backend está desactualizado (falta GET /mias). Reinicia uvicorn en la rama actual.'
            : 'No se pudieron cargar tus publicaciones.')
        setItems([])
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, page, filtro, orden, reloadKey])

  const cambiarFiltro = (v) => { setFiltro(v); setPage(1) }
  const cambiarOrden = (v) => { setOrden(v); setPage(1) }

  // Estado no autenticado
  if (!token) {
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <p className="font-medium text-neutral-700 mb-1">Inicia sesión para ver tus publicaciones</p>
          <p className="text-xs text-neutral-400 mb-4">Solo el dueño ve sus avisos y gestiona sus renovaciones.</p>
          <Link to="/perfil" className="btn-accent text-sm">Mi Perfil / Iniciar Sesión</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-6 md:py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Mis publicaciones</span>
      </nav>

      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900">
          Mis publicaciones {total > 0 && <span className="text-sm font-normal text-neutral-400">({total})</span>}
        </h1>
      </div>

      {/* Guía de estado: qué significa cada estado y cómo te avisamos.
          El dueño recién promovido (publicó pero sigue en revisión) ve aquí
          con claridad que su panel ya está activo y qué sigue. */}
      {!loading && !error && (items.some((p) => p.estado === ESTADO.PENDIENTE) || items.some((p) => p.estado === ESTADO.RECHAZADO)) && (
        <div className="space-y-2 mb-4">
          {items.some((p) => p.estado === ESTADO.PENDIENTE) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5" role="status">
              <p className="text-xs text-amber-800">
                <b className="inline-flex items-center gap-1"><Hourglass aria-hidden="true" className="w-4 h-4" /> {items.filter((p) => p.estado === ESTADO.PENDIENTE).length} aviso(s) en revisión.</b>{' '}
                El equipo de AlojaU los está verificando. Te avisaremos aquí mismo cuando sean visibles.
                {!user?.telegram_vinculado && (
                  <> Vincula tu Telegram en <Link to="/perfil" className="font-semibold underline hover:text-amber-900">Mi Perfil</Link> para enterarte al instante, estés o no en la app.</>
                )}
              </p>
            </div>
          )}
          {items.some((p) => p.estado === ESTADO.RECHAZADO) && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5" role="status">
              <p className="text-xs text-rose-800">
                <b>{items.filter((p) => p.estado === ESTADO.RECHAZADO).length} aviso(s) no aprobado(s).</b>{' '}
                Revisa las reglas de publicación, corrige tu aviso y vuelve a publicarlo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trazabilidad: actividad reciente de todos sus avisos. */}
      <HistorialAvisos token={token} />

      {/* Filtros por estado + orden del panel */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTROS.map(f => (
            <button type="button"
              key={f.value}
              onClick={() => cambiarFiltro(f.value)}
              aria-pressed={filtro === f.value}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filtro === f.value
                  ? 'bg-navy-800 text-white border-navy-800'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-neutral-500">
          Ordenar:
          <select
            value={orden}
            onChange={e => cambiarOrden(e.target.value)}
            aria-label="Ordenar mis publicaciones"
            className="text-xs font-medium border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700"
          >
            {ORDENES_MIS_PUBS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Alerta de error: la sesión vencida guía a re-ingresar (reintentar no sirve sin token). */}
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3" role="alert">
          <p className="text-xs text-red-700 flex-1">{error}</p>
          {/Sesión vencida/i.test(error) ? (
            <Link to="/perfil" className="text-xs font-semibold text-red-700 hover:text-red-800 underline shrink-0">
              Volver a ingresar
            </Link>
          ) : (
            <button type="button" onClick={() => setReloadKey(k => k + 1)} className="text-xs font-semibold text-red-700 hover:text-red-800 underline shrink-0">
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="card p-4 animate-pulse flex flex-col sm:flex-row gap-4">
              <div className="sm:w-44 h-32 bg-neutral-150 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2.5 py-1">
                <div className="h-4 bg-neutral-150 rounded w-1/4" />
                <div className="h-5 bg-neutral-150 rounded w-3/4" />
                <div className="h-4 bg-neutral-150 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        /* Estado vacío explicativo */
        <div className="card p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 bg-navy-50 text-navy-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-neutral-800 mb-1">
            {filtro ? 'Nada aquí con este filtro' : 'Aún no publicas nada'}
          </p>
          <p className="text-xs text-neutral-500 mb-5">
            {filtro
              ? 'Prueba seleccionando otro estado en los filtros.'
              : 'No tienes publicaciones registradas en tu cuenta. Publica tu primer aviso para recibir solicitudes.'}
          </p>
          {!filtro && (
            <Link to="/publicar" className="btn-accent text-sm inline-flex items-center gap-1.5">
              <span>+ Publicar mi primera vivienda</span>
            </Link>
          )}
        </div>
      ) : (
        /* Lista de publicaciones */
        <>
          <div className="space-y-3">
            {items.map((p) => (
              <TarjetaMiAviso
                key={p.id}
                p={p}
                tiposCatalogo={tiposCatalogo}
                cambiando={cambiandoEstado === p.id}
                confirmandoPausa={aPausar === p.id}
                onCambiarEstado={() => handleEstado(p)}
                onCancelarPausa={() => setAPausar(null)}
                onRenovar={() => setRenovando(p)}
                onEditar={() => setEditando(p)}
                onEliminar={() => setAEliminar(p)}
              />
            ))}
          </div>

          <Paginacion page={page} pages={pages} total={total} onPage={setPage} />
        </>
      )}

      {/* Modal para editar publicación */}
      {editando && (
        <EditarPublicacionModal
          pub={editando}
          token={token}
          onClose={() => setEditando(null)}
          onSaved={(upd) => setItems(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x))}
        />
      )}

      {/* Modal para renovar vigencia */}
      {renovando && (
        <RenovarModal
          pub={renovando}
          token={token}
          onClose={() => setRenovando(null)}
          onRenovada={(upd) => {
            setItems(prev => prev.map(x => x.id === (upd.id || upd.publicacion_id || renovando.id)
              ? { ...x, fecha_expiracion: upd.fecha_expiracion_nueva, estado: upd.estado || x.estado }
              : x
            ))
          }}
        />
      )}

      {/* Modal independiente de eliminar (nunca muta el botón de la tarjeta). */}
      {aEliminar && (
        <ConfirmDialog
          titulo="¿Eliminar esta publicación?"
          descripcion={`"${aEliminar.titulo}" dejará de ser visible de inmediato y no se puede deshacer. Si solo quieres ocultarla por un tiempo, considera pausarla.`}
          cancelar="Cancelar"
          confirmar="Sí, eliminar"
          peligro
          ocupado={eliminando}
          onCancelar={() => { if (!eliminando) setAEliminar(null) }}
          onConfirmar={() => handleEliminar(aEliminar)}
        />
      )}
    </div>
  )
}
