import { useState, useEffect } from 'react'
import { api } from '../services/api'
// Hook para HU-001/002 con debounce y abort
export function usePublicaciones(campusId, filtros){
  const [data,setData]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(null)
  useEffect(()=>{
    const ctrl=new AbortController()
    setLoading(true); setError(null)
    const t=setTimeout(()=>{
      api.get('/api/publicaciones',{signal:ctrl.signal, params:{
        campus_id: campusId,
        precio_min: filtros.min||undefined,
        precio_max: filtros.max||undefined,
        tipo: filtros.tipo||undefined
      }}).then(r=>setData(r.data)).catch(e=>{ if(e.name!=='CanceledError'){ setError(e); setData([])}}).finally(()=>setLoading(false))
    },400)
    return ()=>{ clearTimeout(t); ctrl.abort() }
  },[campusId,filtros])
  return {data,loading,error}
}
