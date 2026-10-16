import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, isCancelError } from '../services/api'
import { useComparar } from '../contexts/CompararContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDistancia, formatTiempoCaminando } from '../utils/formatters'
import SmartImage from '../components/SmartImage'
import BadgeConfianza from '../components/BadgeConfianza'
import { portadaUrl, canonTexto, zonaTextoDe, numFotosDe } from '../utils/portada'
import { getEtiquetaTipo } from '../utils/tiposVivienda'
import { etiquetaLugar } from '../components/CercanoA'
import { guardarCampusFiltro, resolverCampusId } from '../utils/persistenciaBuscar'
import useTiposVivienda from '../hooks/useTiposVivienda'

function NoInformado() {
  return <span className="text-neutral-400 italic text-xs">No informado</span>
}

// Compat: antes mapa local; ahora delega a la fuente única (Bloque 3).
// APARTAMENTO legacy (pre-catálogo) se conserva explícito: nunca existió
// en housing_types, así que la fuente única devolvería el slug crudo.
export function humanizarTipoComparar(tipo, tipos = null) {
  if (tipo === 'APARTAMENTO') return 'Apartamento'
  return getEtiquetaTipo(tipo, tipos, null)
}

/**
 * Bloque 4: texto de tiempo a pie con contexto de campus sincronizado.
 * - Con campus seleccionado (filtro global de Buscar ?campus_id=): deja de
 *   flotar y muestra "~2 min a pie de Campus Tulcán".
 * - Sin filtro: fallback explícito "~2 min a pie del campus más cercano".
 */
export function textoTiempoConCampus(distM, campusNombre) {
  const base = formatTiempoCaminando(distM)
  if (!base) return null
  if (campusNombre) return `${base} de ${campusNombre}`
  return `${base} del campus más cercano`
}

export default function Comparar() {
  const { comparar, clear, toggle, error } = useComparar()
  // v14.1: con sesión, el dueño ve sus PENDIENTE en vez de "no disponible".
  const { token: authToken } = useAuth()
  // M2: catálogo dinámico con fallback (misma etiqueta que el resto).
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(false)
  // Bloque 4: filtro global de ubicación de Buscar. Comparar vive en otra
  // ruta (`/comparar`), así que el `?campus_id=` de Buscar no viaja en su
  // URL: se resuelve contra el último filtro guardado (localStorage).
  // La escritura al storage ocurre en efecto (nunca en render).
  const [searchParams] = useSearchParams()
  const paramUrl = searchParams.get('campus_id')
  useEffect(() => {
    if (paramUrl != null && paramUrl !== '' && Number(paramUrl) >= 1) {
      guardarCampusFiltro(paramUrl)
    }
  }, [paramUrl])
  const campusIdParam = resolverCampusId(paramUrl)
  const [campusNombre, setCampusNombre] = useState('')

  useEffect(() => {
    if (!campusIdParam) { setCampusNombre(''); return }
    let vivo = true
    api.get('/api/campus')
      .then((r) => {
        if (!vivo) return
        const lista = Array.isArray(r.data) ? r.data : []
        const hit = lista.find((c) => String(c.id) === String(campusIdParam))
        setCampusNombre(hit ? etiquetaLugar(hit) : '')
      })
      .catch(() => { if (vivo) setCampusNombre('') })
    return () => { vivo = false }
  }, [campusIdParam])

  // FASE 4 free-tier: AbortController (no solo flag vivo): si el usuario
  // navega antes de que resuelva el fetch paralelo, se cancela la red y la
  // respuesta tardía no pisa estado ajeno.
  useEffect(() => {
    if (comparar.length === 0) { setPubs([]); return }
    const controller = new AbortController()
    setLoading(true)
    const cfg = {
      signal: controller.signal,
      ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    }
    Promise.all(comparar.map(id =>
      api.get(`/api/publicaciones/${id}`, cfg).then(r => r.data).catch((err) => {
        if (isCancelError(err) || controller.signal.aborted) return null
        return ({ id, titulo: `ID ${id} no disponible`, error: true })
      })
    ))
      .then((res) => { if (!controller.signal.aborted) setPubs(res.filter(Boolean)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [comparar, authToken])

  const rows = [
    { label: 'Título', key: 'titulo', render: (p) => p.titulo || <NoInformado /> },
    { label: 'Canon mensual', key: 'canon', render: (p) => canonTexto(p) || <NoInformado /> },
    {
      label: 'Depósito', key: 'deposito', render: (p) => {
        const dep = p.deposito_requerido ?? p.deposito
        if (dep == null) return <NoInformado />
        if (Number(dep) === 0) return 'Sin depósito'
        const n = Number(dep)
        return Number.isFinite(n) ? `$${n.toLocaleString('es-CO')}` : <NoInformado />
      }
    },
    { label: 'Tipo', key: 'tipo', render: (p) => (humanizarTipoComparar(p.tipo_inmueble, tiposCatalogo) || <NoInformado />) },
    { label: 'Zona', key: 'zona', render: (p) => zonaTextoDe(p) || <NoInformado /> },
    {
      label: 'Distancia al campus', key: 'dist', render: (p) => {
        const d = p.distancia_geodesica_m ?? p.dist_m
        return d != null ? formatDistancia(d) : <NoInformado />
      }
    },
    {
      label: 'Tiempo a pie', key: 'tiempo',
      render: (p) => {
        const t = textoTiempoConCampus(p.distancia_geodesica_m ?? p.dist_m, campusNombre)
        return t || <NoInformado />
      },
    },
    { label: 'Índice confianza', key: 'indice', render: (p) => p.indice_confianza != null ? <BadgeConfianza indice={p.indice_confianza} /> : <NoInformado /> },
    { label: 'Servicios', key: 'servicios', render: (p) => p.servicios?.length ? p.servicios.join(' · ') : <NoInformado /> },
    { label: 'Fotos', key: 'fotos', render: (p) => `${numFotosDe(p)} fotos` },
    { label: 'Estado', key: 'estado', render: (p) => p.estado === 'PENDIENTE' ? 'En revisión' : p.estado === 'ACTIVO' ? 'Publicada' : (p.estado || <NoInformado />) },
    { label: 'Dirección ref.', key: 'direccion', render: (p) => p.direccion_referencial || <NoInformado /> },
    {
      label: 'Anuncio', key: 'cta', render: (p) => (
        <Link to={`/publicacion/${p.id}`} className="btn-accent !py-1.5 !px-3 !text-xs inline-flex">
          Ver anuncio
        </Link>
      ),
    },
  ]

  return (
    <div className="container-main py-8 md:py-12 min-h-dvh">
      <div className="max-w-5xl mx-auto">
        <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-neutral-600">Comparar</span>
        </nav>

        <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
          Comparar publicaciones
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          Selecciona 2 o 3 publicaciones del buscador para comparar sus caracteristicas lado a lado.
          {campusNombre
            ? <> Distancias medidas <b>a pie de {campusNombre}</b> (filtro activo de Buscar).</>
            : <> Sin filtro de campus: las distancias se miden al campus más cercano.</>}
        </p>

        {error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}

        {comparar.length === 0 && (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-700 mb-1">No hay publicaciones para comparar</p>
            <p className="text-xs text-neutral-400 mb-4">Selecciona 2-3 inmuebles desde Buscar (botón +) o Detalle.</p>
            <Link to="/" className="btn-accent inline-flex">Ir a Buscar</Link>
          </div>
        )}

        {comparar.length === 1 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Selecciona al menos 2 para comparar. Llevas 1/3.
          </p>
        )}

        {loading && <p className="text-sm text-neutral-500 mb-4">Cargando comparación...</p>}

        {pubs.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={clear} className="btn-secondary text-xs">
                Limpiar comparación
              </button>
              <span className="text-xs text-neutral-400">{comparar.length}/3 seleccionadas</span>
            </div>
            {/* PC/tablet: tabla comparativa lado a lado */}
            <div className="card overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-navy-50">
                      <th scope="col" className="text-left px-4 py-3 text-xs font-medium text-navy-700 sticky left-0 z-10 bg-navy-50">Característica</th>
                      {pubs.map(p => (
                        <th key={p.id} className="text-left px-4 py-3 min-w-[180px] max-w-[260px]">
                          <div className="flex flex-col gap-1.5">
                            {/* Miniatura principal + título en la cabecera */}
                            {/* BUG#1: portada = orden=1 vía helper (no fotos[0] crudo). */}
                            {portadaUrl(p) ? (
                              <SmartImage src={portadaUrl(p)} alt={`Foto principal de ${p.titulo || `aviso ${p.id}`}`} className="w-full h-20 object-cover rounded-lg" />
                            ) : (
                              <div className="w-full h-20 rounded-lg bg-neutral-100 flex items-center justify-center" role="img" aria-label="Sin foto">
                                <span aria-hidden="true" className="text-neutral-300 text-xl">⌂</span>
                              </div>
                            )}
                            <Link to={`/publicacion/${p.id}`} className="text-navy-600 hover:text-navy-800 font-semibold line-clamp-2 break-words text-xs">{p.titulo || 'No informado'}</Link>
                            <button type="button" onClick={() => toggle(p.id)} className="text-[11px] text-red-500 hover:text-red-600 hover:underline text-left">Quitar</button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.key} className="border-t border-neutral-100">
                        <th scope="row" className="px-4 py-3 font-medium text-xs bg-neutral-50 sticky left-0 z-10 text-neutral-600 text-left">{row.label}</th>
                        {pubs.map(p => (
                          <td key={p.id} className="px-4 py-3 text-xs sm:text-sm break-words text-neutral-800">{row.render(p)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-neutral-50 border-t border-neutral-150">
                <p className="text-xs text-neutral-400 text-center">
                  * {campusNombre ? `Distancia estimada a pie desde ${campusNombre}.` : 'Distancia estimada a pie desde el campus más cercano.'} Índice informativo, no garantiza seguridad.
                </p>
              </div>
            </div>

            {/* Móvil: carrusel/tarjetas con la MISMA información exacta */}
            <div className="md:hidden space-y-4">
              <div className="flex gap-3 overflow-x-auto no-scrollbar fade-x pb-1 snap-x">
                {pubs.map((p) => (
                  <article key={p.id} className="card overflow-hidden min-w-[270px] max-w-[270px] snap-start">
                    <div className="relative">
                      {portadaUrl(p) ? (
                        <SmartImage src={portadaUrl(p)} alt={`Foto principal de ${p.titulo || `aviso ${p.id}`}`} className="w-full h-36 object-cover" />
                      ) : (
                        <div className="w-full h-36 bg-neutral-100 flex items-center justify-center" role="img" aria-label="Sin foto">
                          <span aria-hidden="true" className="text-neutral-300 text-2xl">⌂</span>
                        </div>
                      )}
                      <button type="button" onClick={() => toggle(p.id)} aria-label={`Quitar ${p.titulo || p.id} de la comparación`} className="absolute top-2 right-2 bg-black/60 text-white text-xs w-8 h-8 rounded-full before:absolute before:-inset-2.5 before:content-['']">×</button>
                    </div>
                    <div className="p-4 space-y-2 text-sm">
                      <Link to={`/publicacion/${p.id}`} className="font-semibold text-navy-700 line-clamp-2 text-sm">{p.titulo || 'No informado'}</Link>
                      <dl className="space-y-1.5 text-xs">
                        {rows.filter((r) => r.key !== 'titulo' && r.key !== 'cta').map((r) => (
                          <div key={r.key} className="flex justify-between gap-2 border-b border-neutral-100 pb-1.5">
                            <dt className="text-neutral-500 shrink-0">{r.label}</dt>
                            <dd className="text-right text-neutral-800 break-words">{r.render(p)}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="pt-1">{rows.find((r) => r.key === 'cta').render(p)}</div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="text-xs text-neutral-400 text-center">
                * {campusNombre ? `Distancia estimada a pie desde ${campusNombre}.` : 'Distancia estimada a pie desde el campus más cercano.'} Desliza para ver cada aviso.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
