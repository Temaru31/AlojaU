// Campanita — notificaciones in-app en el navbar (Fase 3 + rediseño).
//
// - Icono Bell vectorial inline estilo lucide (sin dependencia nueva) +
//   badge ámbar con no_leídas (oculto en 0). Fail-open: si la lectura falla,
//   no se muestra badge pero tampoco se rompe el navbar.
// - Desktop: popover anclado; móvil: sheet inferior (mismo lenguaje que
//   ConfirmDialog). Cierra con backdrop, Esc o navegar.
// - Clic en aviso: marca leída (optimista), cierra y redirige:
//   nuevo_arriendo -> /publicacion/:id, moderacion -> /mis-publicaciones,
//   telegram -> /perfil. Sin destino: solo marca.
// Uso: <Campanita token={token} /> dentro del Router (usa useNavigate).
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useNotificaciones from '../hooks/useNotificaciones'
import { haceRelativo } from '../constants'

function Trazo({ children }) {
  return (
    <svg
      aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-5 h-5 shrink-0"
    >
      {children}
    </svg>
  )
}

const IconoCampana = () => (
  <Trazo>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Trazo>
)

const IconoCasa = () => (
  <Trazo>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </Trazo>
)

const IconoCheck = () => (
  <Trazo>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Trazo>
)

const IconoEnviar = () => (
  <Trazo>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </Trazo>
)

const ICONO_TIPO = {
  nuevo_arriendo: <IconoCasa />,
  moderacion: <IconoCheck />,
  telegram: <IconoEnviar />,
}

function destinoDe(n) {
  if (n.tipo === 'nuevo_arriendo' && n.publicacion_id) return `/publicacion/${n.publicacion_id}`
  if (n.tipo === 'moderacion') return '/mis-publicaciones'
  if (n.tipo === 'telegram') return '/perfil'
  return null
}

function haceCorto(iso) {
  const t = haceRelativo(iso)
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function textoBadge(n) {
  if (!n || n <= 0) return null
  return n > 99 ? '99+' : String(n)
}

export default function Campanita({ token }) {
  const { items, noLeidas, loading, error, marcarLeida, marcarTodas } =
    useNotificaciones({ token })
  const [abierto, setAbierto] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const badge = textoBadge(noLeidas)

  // Cierra al navegar (igual que el dropdown de usuario).
  useEffect(() => { setAbierto(false) }, [location.pathname])
  useEffect(() => {
    if (!abierto) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  if (!token) return null

  const abrirNotificacion = async (n) => {
    setAbierto(false)
    await marcarLeida(n.id)
    const destino = destinoDe(n)
    if (destino) navigate(destino)
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={badge ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="relative p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md transition-colors"
      >
        <span className="w-5 h-5 text-slate-700 hover:text-slate-900 transition-colors inline-flex">
          <IconoCampana />
        </span>
        {badge && (
          <span className="absolute top-0.5 right-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {abierto && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
          />
          <div
            role="menu"
            aria-label="Notificaciones"
            className="fixed inset-x-3 bottom-3 top-auto z-50 md:absolute md:inset-auto md:right-0 md:mt-2 md:bottom-auto md:top-auto md:w-80 flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[70vh] md:max-h-[60vh] animar-subir"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-navy-900">Notificaciones</h2>
              {noLeidas > 0 && (
                <button
                  type="button"
                  onClick={() => { marcarTodas() }}
                  className="text-xs font-semibold text-navy-700 hover:underline"
                >
                  Marcar todas
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 max-h-64" role="list" aria-label="Avisos">
              {loading && items.length === 0 && (
                <p className="px-4 py-6 text-sm text-neutral-400 text-center">Cargando avisos…</p>
              )}
              {error && items.length === 0 && (
                <p className="px-4 py-6 text-sm text-neutral-500 text-center" role="alert">
                  {error} <button type="button" onClick={() => window.location.reload()} className="underline text-navy-700">Reintentar</button>
                </p>
              )}
              {!loading && !error && items.length === 0 && (
                <div className="px-4 py-6 text-center space-y-2">
                  <p className="text-sm text-neutral-500">No tienes notificaciones por ahora.</p>
                  <Link to="/alertas" onClick={() => setAbierto(false)} className="block text-xs text-neutral-400 hover:text-navy-700 hover:underline">
                    Configurar alertas de búsqueda
                  </Link>
                </div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="listitem"
                  onClick={() => abrirNotificacion(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 transition min-h-[44px] ${n.leida ? '' : 'bg-amber-50/50'}`}
                >
                  <span className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true">
                    {ICONO_TIPO[n.tipo] || <IconoCampana />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.leida ? 'text-neutral-600' : 'font-bold text-navy-900'}`}>
                      {n.titulo}
                    </span>
                    {n.cuerpo && <span className="block text-xs text-neutral-500 truncate">{n.cuerpo}</span>}
                    <span className="block text-[11px] text-neutral-400 mt-0.5">{haceCorto(n.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-3 bg-slate-50 rounded-b-xl">
              <Link
                to="/alertas"
                onClick={() => setAbierto(false)}
                className="block text-center text-xs font-semibold text-navy-700 hover:underline min-h-[44px] content-center"
              >
                ⚙️ Gestionar mis alertas de búsqueda
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
