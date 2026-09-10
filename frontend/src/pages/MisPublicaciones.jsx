// MisPublicaciones - bandeja de gestión del propietario (UX navbar: "Mis Publicaciones").
// Muestra exclusivamente las publicaciones del usuario autenticado vía GET /api/publicaciones/mias.
// Cada tarjeta presenta imagen, título, tipo, zona, canon, estado, fecha de expiración,
// cálculo de días restantes según reglas de vigencia y botón de renovación.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { formatDistancia } from '../utils/formatters'
import SmartImage from '../components/SmartImage'
import Paginacion from '../components/Paginacion'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import RenovarModal from '../components/RenovarModal'

/**
 * Reglas de cálculo de días de vigencia:
 * - Faltan más de 1 día: "X días restantes" (ej. "10 días restantes")
 * - Falta 1 día: "1 día restante"
 * - Vence durante el día actual: "Vence hoy"
 * - La expiración ya pasó: "Vencida" (o "No vigente")
 */
export function calcularVigencia(fechaRaw, ahora = new Date()) {
  if (!fechaRaw) return null
  const exp = new Date(fechaRaw)
  if (isNaN(exp.getTime())) return null

  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const vence = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate())
  const diffDias = Math.round((vence.getTime() - hoy.getTime()) / 86_400_000)
  const msDiff = exp.getTime() - ahora.getTime()

  // Si la fecha ya expiró (días negativos o timestamp en el pasado)
  if (diffDias < 0 || msDiff < 0) {
    return {
      texto: 'Vencida',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      dias: diffDias,
      vencida: true,
    }
  }

  // Vence durante el día actual
  if (diffDias === 0) {
    return {
      texto: 'Vence hoy',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dias: 0,
      venceHoy: true,
    }
  }

  // Falta exactamente 1 día
  if (diffDias === 1) {
    return {
      texto: '1 día restante',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dias: 1,
      vigente: true,
    }
  }

  // Faltan más de 1 día (ej. 10 días restantes)
  return {
    texto: `${diffDias} días restantes`,
    badgeClass: diffDias <= 5 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dias: diffDias,
    vigente: true,
  }
}

/** Formatea fecha de expiración en texto legible */
export function formatFechaExpiracion(fechaRaw) {
  if (!fechaRaw) return null
  const d = new Date(fechaRaw)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}

// Labels amigables (nunca enum crudo)
const ESTADO_LABEL = {
  ACTIVO: 'Publicada',
  PENDIENTE: 'En revisión',
  EXPIRADO: 'Vencida',
  PAUSADO: 'Pausada',
  RECHAZADO: 'Rechazada',
  ARRENDADO: 'Arrendada',
  DESACTIVADO: 'Desactivada',
}

const ESTADO_STYLE = {
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  EXPIRADO: 'bg-red-50 text-red-700 border-red-200',
  PAUSADO: 'bg-neutral-50 text-neutral-600 border-neutral-200',
  RECHAZADO: 'bg-rose-50 text-rose-700 border-rose-200',
}

const TIPO_LABEL = {
  HABITACION_INDEPENDIENTE: 'Habitación independiente',
  HABITACION_FAMILIAR: 'Habitación familiar',
  APARTAESTUDIO: 'Apartaestudio',
  COMPARTIDO: 'Compartido',
}

const FILTROS = [
  { value: '', label: 'Todas' },
  { value: 'ACTIVO', label: 'Publicadas' },
  { value: 'PENDIENTE', label: 'En revisión' },
  { value: 'EXPIRADO', label: 'Vencidas' },
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
  const [renovando, setRenovando] = useState(null)

  // Consulta al montar o recargar
  useEffect(() => {
    if (!token) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    api.get('/api/publicaciones/mias', {
      params: { page, size: PAGE_SIZE, ...(filtro ? { estado: filtro } : {}) },
      headers: { Authorization: `Bearer ${token}` },
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
        const status = err?.response?.status
        setError(status === 401
          ? 'Sesión vencida. Inicia sesión de nuevo.'
          : status === 404 || status === 422
            ? 'Tu backend está desactualizado (falta GET /mias). Reinicia uvicorn en la rama actual.'
            : 'No se pudieron cargar tus publicaciones.')
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [token, page, filtro, reloadKey])

  const cambiarFiltro = (v) => { setFiltro(v); setPage(1) }

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

      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por estado">
        {FILTROS.map(f => (
          <button
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

      {/* Alerta de error */}
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3" role="alert">
          <p className="text-xs text-red-700 flex-1">{error}</p>
          <button onClick={() => setReloadKey(k => k + 1)} className="text-xs font-semibold text-red-700 hover:text-red-800 underline shrink-0">
            Reintentar
          </button>
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
            {items.map((p) => {
              const vigencia = calcularVigencia(p.fecha_expiracion)
              const fechaExpTexto = formatFechaExpiracion(p.fecha_expiracion)
              const cover = Array.isArray(p.fotos) && p.fotos.length > 0 ? p.fotos[0] : null
              const zonaTexto = p.zona_nombre || p.zona || 'Zona no informada'
              const tipoTexto = TIPO_LABEL[p.tipo_inmueble] || p.tipo_inmueble || 'Vivienda'
              const canonValor = p.canon_mensual ?? p.canon

              return (
                <article
                  key={p.id}
                  className="card p-0 overflow-hidden flex flex-col sm:flex-row hover:border-navy-200 transition group"
                >
                  {/* 1. Imagen principal */}
                  <div className="sm:w-44 h-36 sm:h-auto bg-neutral-100 relative shrink-0 overflow-hidden">
                    {cover ? (
                      <SmartImage
                        src={cover}
                        alt={p.titulo}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[140px] flex flex-col items-center justify-center bg-navy-50/50 text-navy-300 p-4">
                        <svg className="w-8 h-8 mb-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        <span className="text-[11px] text-neutral-400 font-medium">Sin fotos</span>
                      </div>
                    )}
                  </div>

                  {/* Cuerpo de la tarjeta */}
                  <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      {/* Meta superior: Tipo de inmueble, Zona y Estado */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                          <span className="font-semibold text-navy-800">{tipoTexto}</span>
                          <span>•</span>
                          <span>{zonaTexto}</span>
                          {p.distancia_geodesica_m != null && (
                            <>
                              <span>•</span>
                              <span>{formatDistancia(p.distancia_geodesica_m)}</span>
                            </>
                          )}
                        </div>

                        {/* Estado de publicación */}
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${ESTADO_STYLE[p.estado] || 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                          {ESTADO_LABEL[p.estado] || p.estado}
                        </span>
                      </div>

                      {/* Título de la publicación */}
                      <h2 className="text-base font-semibold text-navy-900 group-hover:text-navy-700 transition line-clamp-1 mb-1" title={p.titulo}>
                        {p.titulo}
                      </h2>

                      {/* Canon mensual */}
                      <p className="text-sm font-bold text-navy-900 mb-2">
                        {canonValor != null
                          ? `$${Number(canonValor).toLocaleString('es-CO')} COP/mes`
                          : 'Canon no informado'}
                        {p.indice_confianza != null && (
                          <span className="text-xs font-normal text-neutral-400 ml-2">
                            · Confianza {p.indice_confianza}/100
                          </span>
                        )}
                      </p>

                      {/* Fechas de vigencia */}
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        {fechaExpTexto && (
                          <span className="text-neutral-500">
                            Expira: <span className="font-medium text-neutral-700">{fechaExpTexto}</span>
                          </span>
                        )}

                        {/* Días restantes o estado de vencimiento */}
                        {vigencia && (
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${vigencia.badgeClass}`}
                          >
                            {vigencia.texto}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones de la tarjeta */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-3 border-t border-neutral-100">
                      <button
                        onClick={() => setRenovando(p)}
                        aria-label={`Renovar ${p.titulo}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1 shadow-sm"
                      >
                        ↻ Renovar
                      </button>

                      <button
                        onClick={() => setEditando(p)}
                        aria-label={`Editar ${p.titulo}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 text-neutral-600 hover:border-navy-300 hover:text-navy-700 transition"
                      >
                        Editar
                      </button>

                      <Link
                        to={`/publicacion/${p.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-navy-700 hover:text-navy-900 hover:bg-neutral-100 transition"
                      >
                        Ver detalle →
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
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
    </div>
  )
}
