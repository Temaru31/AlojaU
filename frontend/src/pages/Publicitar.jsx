// Publicitar - destacar un aviso propio por días (publicidad v1, pago manual).
// Flujo: elige aviso ACTIVO propio -> elige plan 7/15/30d -> referencia de pago
// -> POST /api/publicidad/destacar (PENDIENTE) -> el admin aprueba.
// Uso: ruta /publicitar (query opcional ?publicacion_id=).
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Megaphone, Star } from 'lucide-react'
import { api, getPlanesPublicidad, destacarPublicacion, getMisDestacados } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const ESTADO_LABEL = {
  PENDIENTE: 'Pendiente de aprobación',
  ACTIVO: 'Destacado activo',
  VENCIDO: 'Vencido',
  RECHAZADO: 'Rechazado por el equipo',
}

function listaDe(res) {
  const d = res?.data
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

export default function Publicitar() {
  const { token } = useAuth()
  const [searchParams] = useSearchParams()
  const pedidoId = Number(searchParams.get('publicacion_id')) || null

  const [planes, setPlanes] = useState([])
  const [avisos, setAvisos] = useState([])
  const [destacados, setDestacados] = useState([])
  const [publicacionId, setPublicacionId] = useState(pedidoId)
  const [planId, setPlanId] = useState(null)
  const [pagoRef, setPagoRef] = useState('')
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [creado, setCreado] = useState(null)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let vivo = true
    setLoading(true)
    setError('')
    Promise.all([
      getPlanesPublicidad(),
      api.get('/api/publicaciones/mias', {
        params: { size: 50 },
        headers: { Authorization: `Bearer ${token}` },
      }),
      getMisDestacados(token),
    ])
      .then(([rPlanes, rMias, rDest]) => {
        if (!vivo) return
        const pls = listaDe(rPlanes).filter((p) => p.activo !== false)
        setPlanes(pls)
        const avs = listaDe(rMias)
        setAvisos(avs)
        setDestacados(listaDe(rDest))
        // Preselección: ?publicacion_id= si existe, si no el primer ACTIVO.
        const pedidoOk = pedidoId != null && avs.some((a) => Number(a.id) === pedidoId)
        const inicial = pedidoOk ? pedidoId : (avs.find((a) => a.estado === 'ACTIVO')?.id ?? null)
        setPublicacionId((prev) => prev ?? inicial)
        setPlanId((prev) => prev ?? (pls[0]?.id ?? null))
      })
      .catch((err) => {
        if (!vivo) return
        const status = err?.response?.status
        setError(status === 401
          ? 'Sesión vencida. Inicia sesión de nuevo.'
          : 'No se pudieron cargar los planes. Reintenta.')
      })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [token, pedidoId])

  const confirmar = async (e) => {
    e.preventDefault()
    if (publicacionId == null || planId == null || enviando) return
    setEnviando(true)
    setError('')
    try {
      const r = await destacarPublicacion(
        { publicacion_id: Number(publicacionId), plan_id: Number(planId), pago_ref: pagoRef.trim() || undefined },
        token,
      )
      setCreado(r.data)
      const r2 = await getMisDestacados(token).catch(() => null)
      if (r2) setDestacados(listaDe(r2))
    } catch (err) {
      const status = err?.response?.status
      setError(status === 409
        ? (err?.response?.data?.detail || 'Este aviso ya tiene un destacado vigente o no está activo.')
        : (err?.response?.data?.detail || 'No se pudo crear el destacado.'))
    } finally {
      setEnviando(false)
    }
  }

  if (!token) {
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <p className="font-medium text-neutral-700 mb-1">Inicia sesión para publicitar tu aviso</p>
          <p className="text-xs text-neutral-400 mb-4">Solo el dueño puede destacar sus publicaciones.</p>
          <Link to="/perfil" className="btn-accent text-sm">Mi Perfil / Iniciar Sesión</Link>
        </div>
      </div>
    )
  }

  const planSel = planes.find((p) => Number(p.id) === Number(planId))

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/mis-publicaciones" className="hover:text-navy-600">Mis publicaciones</Link>
        <span>›</span>
        <span className="text-neutral-600">Publicitar</span>
      </nav>

      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1 flex items-center gap-2">
        <Megaphone aria-hidden="true" className="w-5 h-5" /> Destaca tu aviso
      </h1>
      <p className="text-xs text-neutral-400 mb-5">
        Tu aviso aparece primero en la búsqueda durante los días del plan. Pago manual: registras la referencia y el equipo lo aprueba.
      </p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}
      {creado && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mb-4" role="status">
          Destacado #{creado.id} pendiente de aprobación. Te avisaremos cuando esté activo.
        </p>
      )}

      {loading ? (
        <div className="card p-8 animate-pulse space-y-3" aria-label="Cargando planes">
          <div className="h-5 bg-neutral-150 rounded w-1/3" />
          <div className="h-10 bg-neutral-100 rounded" />
          <div className="h-10 bg-neutral-100 rounded" />
        </div>
      ) : (
        <form onSubmit={confirmar} className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <section className="card p-5" aria-label="Aviso a destacar">
              <h2 className="text-sm font-bold text-navy-900 mb-2">1. Elige tu aviso</h2>
              {avisos.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Aún no tienes avisos. <Link to="/publicar" className="text-navy-700 underline">Publica primero</Link>.
                </p>
              ) : (
                <select
                  value={publicacionId ?? ''}
                  onChange={(e) => setPublicacionId(Number(e.target.value))}
                  aria-label="Aviso a destacar"
                  className="input-field w-full"
                >
                  {avisos.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.estado !== 'ACTIVO'}>
                      #{a.id} · {a.titulo || 'Sin título'}{a.estado !== 'ACTIVO' ? ' (no disponible: solo avisos activos)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section className="card p-5" aria-label="Plan de visibilidad">
              <h2 className="text-sm font-bold text-navy-900 mb-2">2. Elige el plan</h2>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Planes disponibles">
                {planes.map((p) => {
                  const checked = Number(planId) === Number(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`cursor-pointer rounded-xl border p-3 transition ${checked ? 'border-navy-700 bg-navy-50 shadow-sm' : 'border-neutral-200 hover:border-navy-300'}`}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={p.id}
                        checked={checked}
                        onChange={() => setPlanId(p.id)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-bold text-navy-900">{p.nombre || `${p.dias} días`}</span>
                      <span className="block text-xs text-neutral-500 mt-0.5">{p.dias} días de visibilidad</span>
                      <span className="block text-sm font-extrabold text-navy-800 mt-1">
                        ${Number(p.precio_cop).toLocaleString('es-CO')} COP
                      </span>
                      {checked && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-navy-700"><Star aria-hidden="true" className="w-3.5 h-3.5" /> Elegido</span>}
                    </label>
                  )
                })}
              </div>
            </section>

            <section className="card p-5" aria-label="Comprobante de pago">
              <h2 className="text-sm font-bold text-navy-900 mb-2">3. Referencia de pago</h2>
              <label htmlFor="pago_ref" className="block text-xs text-neutral-500 mb-1.5">
                Número o código del comprobante (Nequi, PSE, consignación)
              </label>
              <input
                id="pago_ref"
                type="text"
                value={pagoRef}
                onChange={(e) => setPagoRef(e.target.value)}
                placeholder="Ej. NEQUI-123456"
                maxLength={120}
                className="input-field w-full"
              />
            </section>
          </div>

          <aside className="card p-5 h-fit lg:sticky lg:top-24" aria-label="Resumen">
            <h2 className="text-sm font-bold text-navy-900 mb-3">Resumen</h2>
            <dl className="text-xs space-y-1.5 text-neutral-600">
              <div className="flex justify-between gap-2"><dt>Aviso</dt><dd className="font-semibold text-navy-800">#{publicacionId ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Plan</dt><dd className="font-semibold text-navy-800">{planSel ? `${planSel.dias} días` : '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Total</dt><dd className="font-extrabold text-navy-900">{planSel ? `$${Number(planSel.precio_cop).toLocaleString('es-CO')} COP` : '—'}</dd></div>
            </dl>
            <button
              type="submit"
              disabled={enviando || publicacionId == null || planId == null}
              className="btn-accent w-full mt-4 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Confirmar destacado'}
            </button>
            <p className="text-[11px] text-neutral-400 mt-2">Queda pendiente de aprobación del equipo AlojaU.</p>
          </aside>
        </form>
      )}

      {destacados.length > 0 && (
        <section aria-label="Estado de mis destacados" className="mt-8">
          <h2 className="font-display text-lg font-bold text-navy-900 mb-3">Estado de mis destacados</h2>
          <ul className="card divide-y divide-neutral-100">
            {destacados.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                <span className="font-semibold text-navy-800">Destacado #{d.id} · aviso #{d.publicacion_id}</span>
                <span className="text-neutral-500">{d.plan_nombre || ''}</span>
                <span className="ml-auto font-semibold text-navy-700">{ESTADO_LABEL[d.estado] || d.estado}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
