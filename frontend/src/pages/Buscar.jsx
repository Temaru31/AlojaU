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
  useEffect(()=>{ api.get('/api/campus').then(r=>setCampus(r.data)).catch(()=>setCampus([{id:1,nombre_sede:'Campus Tulcán'}])) },[])
  useEffect(()=>{
    // HU-001: GET /api/publicaciones?campus_id=... Tabla15 CU01
    api.get('/api/publicaciones', { params: { campus_id: campusId, precio_min: filtros.min||undefined, precio_max: filtros.max||undefined }})
      .then(r=>setPubs(r.data)).catch(()=>setPubs([]))
  },[campusId, filtros])
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Buscar vivienda por campus</h1>
      <select value={campusId} onChange={e=>setCampusId(e.target.value)} className="border rounded px-3 py-2">
        {campus.map(c=><option key={c.id} value={c.id}>{c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}</option>)}
      </select>
      <Filtros filtros={filtros} setFiltros={setFiltros}/>
      <p className="text-sm text-gray-500">{pubs.length} publicaciones ACTIVAS • distancia geodésica (Haversine, no tiempo a pie)</p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pubs.map(p=> <Link key={p.id} to={`/publicacion/${p.id}`}><Card pub={p}/></Link>)}
      </div>
      {pubs.length===0 && <p className="text-center text-gray-400 py-10">Sin resultados — prueba otro campus o ajusta filtros (HU-001 C2)</p>}
    </div>
  )
}
