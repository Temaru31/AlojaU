// HU-004 Comparar 2-3 publicaciones - matriz localStorage + fetch
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useComparar } from '../contexts/CompararContext'
import { formatTiempoCaminando } from '../utils/formatters'

function NoInformado() {
  return <span className="text-gray-400 italic text-xs">No informado</span>
}

export default function Comparar(){
  const { comparar, clear, toggle, error } = useComparar()
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    if(comparar.length===0){ setPubs([]); return }
    setLoading(true)
    Promise.all(comparar.map(id=> api.get(`/api/publicaciones/${id}`).then(r=>r.data).catch(()=> ({ id, titulo: `ID ${id} no disponible`, error: true }))))
      .then(setPubs)
      .finally(()=> setLoading(false))
  },[comparar])

  const rows = [
    { label: 'Título', key: 'titulo', render: (p)=> p.titulo || <NoInformado /> },
    { label: 'Canon mensual', key: 'canon', render: (p)=> p.canon_mensual != null ? `$${Number(p.canon_mensual).toLocaleString('es-CO')} COP/mes` : <NoInformado /> },
    { label: 'Depósito', key: 'deposito', render: (p)=> {
        const dep = p.deposito_requerido ?? p.deposito
        if(dep==null || dep===0) return <span className="text-gray-500 text-xs">0 (No informado si 0)</span>
        return `$${Number(dep).toLocaleString('es-CO')}`
      } },
    { label: 'Tipo', key: 'tipo', render: (p)=> p.tipo_inmueble || <NoInformado /> },
    { label: 'Zona', key: 'zona', render: (p)=> p.zona_nombre || p.zona || <NoInformado /> },
    { label: 'Distancia geodésica', key: 'dist', render: (p)=> {
        const d = p.distancia_geodesica_m ?? p.dist_m
        return d != null ? `${d} m` : <NoInformado />
      } },
    { label: 'Tiempo caminando', key: 'tiempo', render: (p)=> formatTiempoCaminando(p.distancia_geodesica_m ?? p.dist_m) || <NoInformado /> },
    { label: 'Índice confianza', key: 'indice', render: (p)=> p.indice_confianza != null ? `${p.indice_confianza}/100` : <NoInformado /> },
    { label: 'Servicios', key: 'servicios', render: (p)=> p.servicios?.length ? p.servicios.join(' • ') : <NoInformado /> },
    { label: 'Fotos', key: 'fotos', render: (p)=> `${Array.isArray(p.fotos)? p.fotos.length : (p.num_fotos||0)} fotos` },
    { label: 'Estado', key: 'estado', render: (p)=> p.estado || <NoInformado /> },
    { label: 'Dirección ref.', key: 'direccion', render: (p)=> p.direccion_referencial || <NoInformado /> },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Comparar 2-3 publicaciones (HU-004)</h1>
      <p className="text-xs sm:text-sm text-gray-500">Selecciona 2-3 inmuebles desde Buscar (botón +) o Detalle. Máximo 3. Datos locales con vigencia 30d. “No informado” si falta.</p>
      {error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      {comparar.length===0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-gray-500">No hay publicaciones para comparar.</p>
          <Link to="/" className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Ir a Buscar</Link>
        </div>
      )}
      {comparar.length===1 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Selecciona al menos 2 para comparar. Llevas 1/3.</p>
      )}
      {loading && <p className="text-sm text-gray-500">Cargando comparación...</p>}

      {pubs.length>0 && (
        <>
          <div className="flex gap-2">
            <button onClick={clear} className="text-xs sm:text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Limpiar comparación</button>
            <span className="text-xs text-gray-400 py-1.5">{comparar.length}/3 seleccionadas • localStorage</span>
          </div>
          <div className="overflow-x-auto bg-white rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50">Característica</th>
                  {pubs.map(p=> (
                    <th key={p.id} className="text-left px-3 py-2 min-w-[180px] max-w-[260px]">
                      <div className="flex flex-col gap-1">
                        <Link to={`/publicacion/${p.id}`} className="text-indigo-600 hover:underline font-semibold line-clamp-2 break-words text-xs">{p.titulo}</Link>
                        <button onClick={()=> toggle(p.id)} className="text-[11px] text-red-600 hover:underline text-left">Quitar</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row=> (
                  <tr key={row.key} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-xs bg-gray-50 sticky left-0">{row.label}</td>
                    {pubs.map(p=> (
                      <td key={p.id} className="px-3 py-2 text-xs sm:text-sm break-words">{row.render(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">* Distancia geodésica Haversine, no tiempo ruteado. Índice informativo, no garantiza seguridad.</p>
        </>
      )}
    </div>
  )
}
