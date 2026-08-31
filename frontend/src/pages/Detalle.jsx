import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import Indice from '../components/IndiceConfianza'
import MapaZona from '../components/MapaZona'
// HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp + Mapa zona
export default function Detalle(){
  const {id}=useParams()
  const [pub,setPub]=useState(null)
  useEffect(()=>{ api.get(`/api/publicaciones/${id}`).then(r=>setPub(r.data)).catch(()=>setPub(null)) },[id])
  if(!pub) return <p className="p-4">Cargando...</p>
  const hasTel = !!pub.telefono_whatsapp
  const wa = hasTel ? `https://wa.me/${pub.telefono_whatsapp}?text=${encodeURIComponent(`Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`)}` : null
  return (
    <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <h1 className="text-2xl font-bold">{pub.titulo}</h1>
        <p className="text-indigo-600 font-bold text-xl">${pub.canon_mensual?.toLocaleString()||pub.canon?.toLocaleString()} COP/mes {pub.deposito_requerido?`+ depósito $${pub.deposito_requerido.toLocaleString()}`:''}</p>
        <div className="flex gap-2 flex-wrap text-sm">
          <span className="bg-gray-100 px-2 py-1 rounded">Zona: {pub.zona_nombre||pub.zona||'Pandiguando'}</span>
          <span className="bg-gray-100 px-2 py-1 rounded">{pub.tipo_inmueble}</span>
          <span className="bg-gray-100 px-2 py-1 rounded">{pub.servicios?.join(', ')}</span>
        </div>
        <p className="text-sm"><b>Reglas:</b> {pub.reglas_convivencia||pub.reglas}</p>
        <p className="text-sm"><b>Dirección ref:</b> {pub.direccion_referencial} • <b>Distancia:</b> {pub.distancia_geodesica_m||pub.dist_m} m (Haversine, no ruteo a pie)</p>
        <MapaZona zona={pub.zona_nombre||pub.zona} dist_m={pub.distancia_geodesica_m||pub.dist_m||320} campus={{lat:2.443,lng:-76.606}} />
        {hasTel ? <a href={wa} target="_blank" rel="noopener" className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded mt-2">Contactar por WhatsApp (HU-008)</a> : <p className="text-sm text-red-500 mt-2">Sin WhatsApp autorizado (HU-008 C1) — no se muestra botón</p>}
        <p className="text-xs text-gray-400">Fotos: {pub.fotos?.length||pub.num_fotos||3} • Vigencia 30d • Estado: {pub.estado}</p>
      </div>
      <div><Indice indice={pub.indice_confianza||0} desglose={pub.desglose||{completitud:40,telefono:20,fotos:15,vigencia:15,reportes:10}}/></div>
    </div>
  )
}
