// Campanita — notificaciones in-app en el navbar (Fase 3).
//
// - Badge con no_leídas (tope visual 99+), fail-open: si la lectura falla,
//   no se muestra badge pero tampoco se rompe el navbar.
// - Desktop: dropdown anclado con scroll interno. Móvil: sheet inferior
//   (mismo lenguaje que ConfirmDialog). Cierra con backdrop, Esc o navegar.
// - Clic en aviso: marca leída (optimista) y lleva al detalle si trae
//   publicacion_id; si no, solo marca.
// Uso: <Campanita token={token} /> dentro del Router (usa useNavigate).
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useNotificaciones from '../hooks/useNotificaciones'
import { haceRelativo } from '../constants'

const ICONO_TIPO = {
  nuevo_arriendo: '🏠',
  moderacion: '🛡️',
  vencimiento: '⏳',
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
  const cajaRef = useRef(null)
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
    if (n.publicacion_id) navigate(`/publicacion/${n.publicacion_id}`)
  }

  return (
    <div ref={cajaRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={badge ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="relative p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-500 hover:text-navy-700 rounded-md transition-colors"
      >
        <span aria-hidden="true" className="text-xl leading-none">🔔</span>
        {badge && (
          <span className="absolute top-0.5 right-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-px rounded-full min-w-5 text-center" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {abierto && (
        <>
          <div aria-hidden="true" onClick={() => setAbierto(false)} className="fixed inset-0 z-40" />
          <div
            role="menu"
            aria-label="Notificaciones"
            className="fixed inset-x-3 bottom-3 top-auto z-50 md:inset-auto md:right-0 md:top-11 md:w-96 flex flex-col bg-white rounded-2xl border border-neutral-150 shadow-xl overflow-hidden max-h-[70vh] md:max-h-[60vh] animar-subir"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100">
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
            <div className="overflow-y-auto flex-1" role="list" aria-label="Avisos">
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
                  <p className="text-sm text-neutral-500">Sin notificaciones por ahora.</p>
                  <Link to="/alertas" onClick={() => setAbierto(false)} className="text-xs font-semibold text-navy-700 hover:underline">
                    Crear una alerta de búsqueda
                  </Link>
                </div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="listitem"
                  onClick={() => abrirNotificacion(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 active:bg-neutral-100 transition min-h-[44px] ${n.leida ? '' : 'bg-navy-50/60'}`}
                >
                  <span aria-hidden="true" className="text-lg leading-none mt-0.5 shrink-0">
                    {ICONO_TIPO[n.tipo] || '🔔'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.leida ? 'text-neutral-600' : 'font-semibold text-navy-900'}`}>
                      {!n.leida && <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />}
                      {n.titulo}
                    </span>
                    {n.cuerpo && <span className="block text-xs text-neutral-500 truncate">{n.cuerpo}</span>}
                    <span className="block text-[11px] text-neutral-400 mt-0.5">{haceRelativo(n.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-neutral-100">
              <Link
                to="/alertas"
                onClick={() => setAbierto(false)}
                className="block text-center text-xs font-semibold text-navy-700 hover:underline min-h-[44px] content-center"
              >
                Gestionar mis alertas
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
