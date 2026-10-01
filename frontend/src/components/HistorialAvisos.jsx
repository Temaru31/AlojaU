// HistorialAvisos — actividad reciente del arrendador (trazabilidad).
// Consume GET /api/publicaciones/mias/historial (eventos de TODOS sus
// avisos con título). Acordeón cerrado por defecto (carga lazy: el fetch
// ocurre solo al abrir). Etiquetas humanas, nunca enums crudos.
// Uso: <HistorialAvisos token={token} /> (retorna null sin token).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, isCancelError } from '../services/api'
import { haceRelativo } from '../constants'

// Fuente única evento -> lenguaje humano (alineada con ESTADO_LABEL de
// MisPublicaciones y MENSAJE_ESTADO_DUENO del backend).
export const EVENTO_INFO = {
  CREATED: { icono: '📝', etiqueta: 'Aviso creado', tono: 'bg-navy-50 text-navy-700 border-navy-100' },
  APPROVED: { icono: '✅', etiqueta: 'Aprobado: ya visible', tono: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { icono: '❌', etiqueta: 'No aprobado', tono: 'bg-rose-50 text-rose-700 border-rose-200' },
  PAUSED: { icono: '⏸️', etiqueta: 'Pausado', tono: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  RESUMED: { icono: '▶️', etiqueta: 'Reanudado', tono: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RENEWED: { icono: '🔄', etiqueta: 'Vigencia renovada', tono: 'bg-navy-50 text-navy-700 border-navy-100' },
}

export function infoEvento(evento) {
  return EVENTO_INFO[evento] || { icono: '•', etiqueta: String(evento || 'Evento'), tono: 'bg-neutral-100 text-neutral-600 border-neutral-200' }
}

export default function HistorialAvisos({ token }) {
  const [abierto, setAbierto] = useState(false)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  // Cambio de sesión: nunca mostrar actividad ajena (limpia todo).
  useEffect(() => {
    setItems([])
    setTotal(0)
    setError('')
    setIntento(0)
  }, [token])

  useEffect(() => {
    if (!token || !abierto) return
    // Refetch en cada apertura: la moderación pudo aprobar en otra pestaña.
    const controller = new AbortController()
    setCargando(true)
    setError('')
    api.get('/api/publicaciones/mias/historial', {
      params: { size: 10 },
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => {
        const data = r.data || {}
        const lista = Array.isArray(data.items) ? data.items.filter((i) => i && typeof i.evento === 'string') : []
        setItems(lista)
        setTotal(Number(data.total ?? lista.length) || 0)
      })
      .catch((err) => {
        if (isCancelError(err) || controller.signal.aborted) return
        setError('No se pudo cargar la actividad.')
      })
      .finally(() => { if (!controller.signal.aborted) setCargando(false) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, abierto, intento])

  if (!token) return null

  return (
    <section aria-label="Actividad reciente de tus avisos" className="card mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-navy-800">
          🕘 Actividad reciente
          {total > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-700 border border-navy-100">
              {total}
            </span>
          )}
        </span>
        <span aria-hidden="true" className={`text-neutral-400 text-xs transition ${abierto ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4">
          {cargando && (
            <div className="space-y-2 animate-pulse" aria-label="Cargando actividad">
              {[1, 2].map((i) => <div key={i} className="h-10 bg-neutral-100 rounded-lg" />)}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              <p className="text-xs text-red-700 flex-1">{error}</p>
              <button type="button" onClick={() => setIntento((n) => n + 1)} className="text-xs font-semibold text-red-700 underline shrink-0">
                Reintentar
              </button>
            </div>
          )}
          {!cargando && !error && items.length === 0 && (
            <p className="text-xs text-neutral-500">Sin actividad todavía. Aquí verás aprobaciones, pausas y renovaciones de tus avisos.</p>
          )}
          {!cargando && !error && items.length > 0 && (
            <ol className="relative space-y-0 border-l-2 border-neutral-150 ml-1.5 pl-0">
              {items.map((it) => {
                const info = infoEvento(it.evento)
                const destino = it.publicacion_id != null ? `/publicacion/${it.publicacion_id}` : null
                return (
                  <li key={it.id} className="relative pl-5 pb-3 last:pb-0">
                    <span aria-hidden="true" className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-navy-200" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${info.tono}`}>
                        <span aria-hidden="true">{info.icono}</span> {info.etiqueta}
                      </span>
                      {destino ? (
                        <Link to={destino} className="text-xs font-medium text-navy-700 hover:underline line-clamp-1">
                          {it.titulo || `Aviso #${it.publicacion_id}`}
                        </Link>
                      ) : (
                        <span className="text-xs font-medium text-neutral-500">{it.titulo || 'Aviso'}</span>
                      )}
                    </div>
                    {it.creado_en && (
                      <p className="text-[11px] text-neutral-400 mt-0.5">{haceRelativo(it.creado_en)}</p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
