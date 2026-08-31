import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import Card from '../components/Card'
import Filtros from '../components/Filtros'
// HU-001: Buscar por campus + HU-002 Filtros
export default function Buscar() {
  const [campus, setCampus] = useState([])
  const [campusId, setCampusId] = useState(1)
  const [filtros, setFiltros] = useState({})
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(()=>{ api.get('/api/campus').then(r=>setCampus(r.data)).catch(()=>setCampus([{id:1,nombre_sede:'Campus Tulcán'}])) },[])
  useEffect(()=>{
    // HU-001: GET /api/publicaciones?campus_id=... Tabla15 CU01
    setLoading(true); setError('')
    api.get('/api/publicaciones', { params: { campus_id: campusId, precio_min: filtros.min||undefined, precio_max: filtros.max||undefined, tipo: filtros.tipo||undefined, servicios: filtros.servicios||undefined }})
      .then(r=>setPubs(r.data))
      .catch(()=>{ setError('No se pudo cargar publicaciones. Intenta de nuevo.'); setPubs([])})
      .finally(()=> setLoading(false))
  },[campusId, filtros])
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
      <h1 className="text-xl sm:text-2xl font-bold break-words">Buscar vivienda por campus</h1>
      <div className="w-full sm:w-auto">
        <select value={campusId} onChange={e=>setCampusId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
          {campus.map(c=><option key={c.id} value={c.id}>{c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}</option>)}
        </select>
      </div>
      <Filtros filtros={filtros} setFiltros={setFiltros}/>
      <p className="text-xs sm:text-sm text-gray-500 break-words" aria-live="polite">{loading ? 'Cargando...' : `${pubs.length} publicaciones ACTIVAS • distancia geodésica (Haversine, no tiempo a pie)`}</p>
      {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm" role="alert">{error}</p>}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1,2,3,4,5,6].map(i=> <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse"><div className="h-36 sm:h-40 bg-gray-100"></div><div className="p-4 space-y-2"><div className="h-3 bg-gray-100 rounded w-1/3"></div><div className="h-4 bg-gray-100 rounded w-3/4"></div><div className="h-3 bg-gray-100 rounded w-1/2"></div></div></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {pubs.map(p=> <Link key={p.id} to={`/publicacion/${p.id}`} className="min-w-0 block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl"><Card pub={p}/></Link>)}
        </div>
      )}
      {!loading && pubs.length===0 && <p className="text-center text-gray-400 py-10 text-sm sm:text-base px-4">Sin resultados — prueba otro campus o ajusta filtros (HU-001 C2)</p>}
    </div>
  )
}
