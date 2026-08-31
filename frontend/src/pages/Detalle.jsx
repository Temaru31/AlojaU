import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import Indice from '../components/IndiceConfianza'
// HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp
export default function Detalle(){
  const {id}=useParams()
  const [pub,setPub]=useState(null)
  useEffect(()=>{ api.get(`/api/publicaciones/${id}`).then(r=>setPub(r.data)) },[id])
  if(!pub) return <p className="p-4">Cargando...</p>
  const wa = `https://wa.me/${pub.telefono_whatsapp}?text=${encodeURIComponent(`Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`)}`
  return (
    <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2 space-y-3">
        <h1 className="text-2xl font-bold">{pub.titulo}</h1>
        <p className="text-indigo-600 font-bold text-xl">${pub.canon?.toLocaleString()} COP/mes {pub.deposito?`+ depósito $${pub.deposito.toLocaleString()}`:''}</p>
        <p className="text-sm">Zona: {pub.zona||'Pandiguando'} • Servicios: {pub.servicios?.join(', ')}</p>
        <p className="text-sm">Reglas: {pub.reglas}</p>
        <p className="text-xs text-gray-500">Distancia geodésica aproximada al campus (Haversine, no ruteo).</p>
        {pub.telefono_whatsapp ? <a href={wa} target="_blank" className="inline-block bg-green-600 text-white px-6 py-3 rounded mt-2">Contactar por WhatsApp (HU-008)</a> : <p className="text-sm text-red-500">Sin WhatsApp autorizado (HU-008 C1)</p>}
      </div>
      <div><Indice indice={pub.indice_confianza||85} desglose={pub.desglose||{completitud:40,telefono:20,fotos:15,vigencia:0,reportes:10}}/></div>
    </div>
  )
}
