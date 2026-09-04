import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useComparar } from '../contexts/CompararContext'
import { formatTiempoCaminando } from '../utils/formatters'

function NoInformado() {
  return <span className="text-neutral-400 italic text-xs">No informado</span>
}

export default function Comparar() {
  const { comparar, clear, toggle, error } = useComparar()
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (comparar.length === 0) { setPubs([]); return }
    setLoading(true)
    Promise.all(comparar.map(id =>
      api.get(`/api/publicaciones/${id}`).then(r => r.data).catch(() => ({ id, titulo: `ID ${id} no disponible`, error: true }))
    ))
      .then(setPubs)
      .finally(() => setLoading(false))
  }, [comparar])

  const rows = [
    { label: 'Título', key: 'titulo', render: (p) => p.titulo || <NoInformado /> },
    { label: 'Canon mensual', key: 'canon', render: (p) => p.canon_mensual != null ? `$${Number(p.canon_mensual).toLocaleString('es-CO')} COP/mes` : <NoInformado /> },
    {
      label: 'Depósito', key: 'deposito', render: (p) => {
        const dep = p.deposito_requerido ?? p.deposito
        if (dep == null || dep === 0) return <span className="text-neutral-500 text-xs">0 (No informado si 0)</span>
        return `$${Number(dep).toLocaleString('es-CO')}`
      }
    },
    { label: 'Tipo', key: 'tipo', render: (p) => p.tipo_inmueble || <NoInformado /> },
    { label: 'Zona', key: 'zona', render: (p) => p.zona_nombre || p.zona || <NoInformado /> },
    {
      label: 'Distancia geodésica', key: 'dist', render: (p) => {
        const d = p.distancia_geodesica_m ?? p.dist_m
        return d != null ? `${d} m` : <NoInformado />
      }
    },
    { label: 'Tiempo caminando', key: 'tiempo', render: (p) => formatTiempoCaminando(p.distancia_geodesica_m ?? p.dist_m) || <NoInformado /> },
    { label: 'Índice confianza', key: 'indice', render: (p) => p.indice_confianza != null ? `${p.indice_confianza}/100` : <NoInformado /> },
    { label: 'Servicios', key: 'servicios', render: (p) => p.servicios?.length ? p.servicios.join(' · ') : <NoInformado /> },
    { label: 'Fotos', key: 'fotos', render: (p) => `${Array.isArray(p.fotos) ? p.fotos.length : (p.num_fotos || 0)} fotos` },
    { label: 'Estado', key: 'estado', render: (p) => p.estado || <NoInformado /> },
    { label: 'Dirección ref.', key: 'direccion', render: (p) => p.direccion_referencial || <NoInformado /> },
  ]

  return (
    <div className="container-main py-8 md:py-12">
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
              <button onClick={clear} className="btn-secondary text-xs">
                Limpiar comparación
              </button>
              <span className="text-xs text-neutral-400">{comparar.length}/3 seleccionadas</span>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-navy-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-navy-700 sticky left-0 bg-navy-50">Característica</th>
                      {pubs.map(p => (
                        <th key={p.id} className="text-left px-4 py-3 min-w-[180px] max-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <Link to={`/publicacion/${p.id}`} className="text-navy-600 hover:text-navy-800 font-semibold line-clamp-2 break-words text-xs">{p.titulo}</Link>
                            <button onClick={() => toggle(p.id)} className="text-[11px] text-red-500 hover:text-red-600 hover:underline text-left">Quitar</button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.key} className="border-t border-neutral-100">
                        <td className="px-4 py-3 font-medium text-xs bg-neutral-50 sticky left-0 text-neutral-600">{row.label}</td>
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
                  * Distancia geodésica Haversine, no tiempo ruteado. Índice informativo, no garantiza seguridad.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
