import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import Card from '../components/Card'
import Filtros from '../components/Filtros'
import Paginacion from '../components/Paginacion'
// HU-001: Buscar por campus + HU-002 Filtros + Paginación URL state
export default function Buscar() {
  const [campus, setCampus] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()
  const campusId = Number(searchParams.get('campus_id') || 1)
  const page = Number(searchParams.get('page') || 1)
  const [filtros, setFiltros] = useState({
    min: searchParams.get('precio_min') || '',
    max: searchParams.get('precio_max') || '',
    tipo: searchParams.get('tipo') || '',
    servicios: searchParams.get('servicios') || '',
  })
  const [pubs, setPubs] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const setCampusId = (id)=>{
    const params = new URLSearchParams(searchParams)
    params.set('campus_id', id)
    params.set('page', 1)
    setSearchParams(params)
  }
  const setPage = (p)=>{
    const params = new URLSearchParams(searchParams)
    params.set('page', p)
    setSearchParams(params)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // debounce filtros -> URL (400ms) para no spamear API
  useEffect(()=>{
    const t = setTimeout(()=>{
      const params = new URLSearchParams(searchParams)
      filtros.min ? params.set('precio_min', filtros.min) : params.delete('precio_min')
      filtros.max ? params.set('precio_max', filtros.max) : params.delete('precio_max')
      filtros.tipo ? params.set('tipo', filtros.tipo) : params.delete('tipo')
      filtros.servicios ? params.set('servicios', filtros.servicios) : params.delete('servicios')
      params.set('page', 1)
      // solo actualiza si cambió
      if(params.toString() !== searchParams.toString()){
        setSearchParams(params)
      }
    }, 400)
    return ()=> clearTimeout(t)
  }, [filtros.min, filtros.max, filtros.tipo, filtros.servicios])

  useEffect(()=>{ api.get('/api/campus').then(r=>setCampus(r.data)).catch(()=>setCampus([{id:1,nombre_sede:'Campus Tulcán'}])) },[])

  useEffect(()=>{
    setLoading(true); setError('')
    const params = {
      campus_id: campusId,
      precio_min: searchParams.get('precio_min')||undefined,
      precio_max: searchParams.get('precio_max')||undefined,
      tipo: searchParams.get('tipo')||undefined,
      servicios: searchParams.get('servicios')||undefined,
      page, size: 9
    }
    api.get('/api/publicaciones', { params })
      .then(r=>{
        const data = r.data
        // Soporta tanto array (viejo) como paginado {items,total,pages}
        if(Array.isArray(data)){
          setPubs(data); setTotal(data.length); setPages(1)
        } else {
          setPubs(data.items || []); setTotal(data.total || 0); setPages(data.pages || 1)
        }
      })
      .catch(()=>{ setError('No se pudo cargar publicaciones. Intenta de nuevo.'); setPubs([])})
      .finally(()=> setLoading(false))
  },[campusId, page, searchParams])
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
      <h1 className="text-xl sm:text-2xl font-bold break-words">Buscar vivienda por campus</h1>
      <div className="w-full sm:w-auto">
        <select value={campusId} onChange={e=>setCampusId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
          {campus.map(c=><option key={c.id} value={c.id}>{c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}</option>)}
        </select>
      </div>
      <Filtros filtros={filtros} setFiltros={setFiltros}/>
      <p className="text-xs sm:text-sm text-gray-500 break-words" aria-live="polite">{loading ? 'Cargando...' : `${total} publicaciones ACTIVAS • página ${page}/${pages} • distancia geodésica (Haversine, no tiempo a pie)`}</p>
      {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm" role="alert">{error}</p>}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1,2,3,4,5,6].map(i=> <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse"><div className="h-36 sm:h-40 bg-gray-100"></div><div className="p-4 space-y-2"><div className="h-3 bg-gray-100 rounded w-1/3"></div><div className="h-4 bg-gray-100 rounded w-3/4"></div><div className="h-3 bg-gray-100 rounded w-1/2"></div></div></div>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {pubs.map(p=> <Link key={p.id} to={`/publicacion/${p.id}`} className="min-w-0 block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl"><Card pub={p}/></Link>)}
          </div>
          <Paginacion page={page} pages={pages} total={total} onPage={setPage} />
        </>
      )}
      {!loading && pubs.length===0 && <p className="text-center text-gray-400 py-10 text-sm sm:text-base px-4">Sin resultados — prueba otro campus o ajusta filtros (HU-001 C2)</p>}
    </div>
  )
}
