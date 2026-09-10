// MisPublicaciones - bandeja del dueño (UX navbar: "Mis Publicaciones").
// Muestra TODOS los estados vía GET /api/publicaciones/mias (paginado + filtro).
// Sin token: invita a iniciar sesión (link a /perfil). Uso: ruta /mis-publicaciones.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { formatDistancia } from '../utils/formatters'
import Paginacion from '../components/Paginacion'
import EditarPublicacionModal from '../components/EditarPublicacionModal'

// Nunca el enum crudo de BD al dueño.
const ESTADO_LABEL = { ACTIVO: 'Publicada', PENDIENTE: 'En revisión' }
const ESTADO_STYLE = {
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
}
const FILTROS = [
  { value: '', label: 'Todas' },
  { value: 'ACTIVO', label: 'Publicadas' },
  { value: 'PENDIENTE', label: 'En revisión' },
]
const PAGE_SIZE = 12

export default function MisPublicaciones() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editando, setEditando] = useState(null)

  // OLA4: AbortController — cambiar de filtro/página aborta la petición anterior
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
    // Auth: Bearer obligatorio (sin token el backend responde 401).
    // Acepta shape paginado {items,total,pages} (y legacy array por compat).
    api.get('/api/publicaciones/mias', {
      params: { page, size: PAGE_SIZE, ...(filtro ? { estado: filtro } : {}) },
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(r => {
        const data = r.data
        if (Array.isArray(data)) {
          setItems(data); setTotal(data.length); setPages(1)
        } else {
          setItems(data.items || []); setTotal(data.total || 0); setPages(data.pages || 1)
        }
      })
      .catch(err => {
        if (err?.code === 'ERR_CANCELED') return
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
  }, [token, page, filtro, reloadKey])

  const cambiarFiltro = (v) => { setFiltro(v); setPage(1) }

  if (!token) {
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <p className="font-medium text-neutral-700 mb-1">Inicia sesión para ver tus publicaciones</p>
          <p className="text-xs text-neutral-400 mb-4">Solo el dueño ve sus avisos pendientes de revisión.</p>
          <Link to="/perfil" className="btn-accent text-sm">Mi Perfil / Iniciar Sesión</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Mis publicaciones</span>
      </nav>
      {/* UX: sin botón "+ Publicar" aquí (ya existe en el navbar superior) */}
      <div className="mb-4">
        <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900">
          Mis publicaciones {total > 0 && <span className="text-sm font-normal text-neutral-400">({total})</span>}
        </h1>
      </div>

      {/* Filtro por estado (paginado en backend, no trae cientos de golpe) */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por estado">
        {FILTROS.map(f => (
          <button type="button"
            key={f.value}
            onClick={() => cambiarFiltro(f.value)}
            aria-pressed={filtro === f.value}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filtro === f.value ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3" role="alert">
          <p className="text-xs text-red-700 flex-1">{error}</p>
          <button type="button" onClick={() => setReloadKey(k => k + 1)} className="text-xs font-semibold text-red-700 hover:text-red-800 underline shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="card p-6 animate-pulse space-y-3">
          <div className="h-4 bg-neutral-150 rounded w-1/3" />
          <div className="h-4 bg-neutral-150 rounded w-2/3" />
        </div>
      ) : items.length === 0 && !error ? (
        <div className="card p-12 text-center">
          <p className="text-sm font-medium text-neutral-700 mb-1">
            {filtro ? 'Nada aquí con este filtro' : 'Aún no publicas nada'}
          </p>
          <p className="text-xs text-neutral-400 mb-4">
            {filtro ? 'Prueba con otro estado.' : 'Tu primer aviso queda En revisión antes de salir en Buscar.'}
          </p>
          {!filtro && <Link to="/publicar" className="btn-accent text-sm">Publicar mi primera vivienda</Link>}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((p) => (
              <article key={p.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-800 truncate">{p.titulo}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {p.canon_mensual != null ? `$${Number(p.canon_mensual).toLocaleString('es-CO')} COP/mes` : 'No informado'}
                    {' · '}{p.distancia_geodesica_m != null ? formatDistancia(p.distancia_geodesica_m) : 'Sin distancia'}
                    {' · '}confianza {p.indice_confianza ?? 0}/100
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${ESTADO_STYLE[p.estado] || 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                    {ESTADO_LABEL[p.estado] || p.estado}
                  </span>
                  <button type="button"
                    onClick={() => setEditando(p)}
                    aria-label={`Editar ${p.titulo}`}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 text-neutral-600 hover:border-navy-300 hover:text-navy-700 transition"
                  >
                    Editar
                  </button>
                  <Link to={`/publicacion/${p.id}`} className="text-xs font-medium text-navy-600 hover:underline">
                    Ver →
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Paginacion page={page} pages={pages} total={total} onPage={setPage} />
        </>
      )}

      {editando && (
        <EditarPublicacionModal
          pub={editando}
          token={token}
          onClose={() => setEditando(null)}
          onSaved={(upd) => setItems(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x))}
        />
      )}
    </div>
  )
}
