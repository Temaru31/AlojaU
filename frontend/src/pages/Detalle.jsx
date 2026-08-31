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
  const isActivo = pub.estado === 'ACTIVO'
  const hasTel = !!pub.telefono_whatsapp && isActivo
  const wa = hasTel ? `https://wa.me/${pub.telefono_whatsapp}?text=${encodeURIComponent(`Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`)}` : null
  const canon = pub.canon_mensual ?? pub.canon
  const deposito = pub.deposito_requerido ?? pub.deposito
  const zona = pub.zona_nombre || pub.zona || '—'
  const dist = pub.distancia_geodesica_m ?? pub.dist_m
  const numFotos = Array.isArray(pub.fotos) ? pub.fotos.length : (pub.num_fotos ?? 3)
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
      <div className="md:col-span-2 space-y-4 min-w-0">
        {!isActivo && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
            No disponible para contacto — Estado: <b>{pub.estado}</b> {pub.estado==='PENDIENTE' ? '(en moderación, HU-003 C3)' : ''} — Solo ACTIVO es contactable.
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold break-words leading-tight">{pub.titulo}</h1>
        <p className="text-indigo-600 font-bold text-lg sm:text-xl break-words">{canon != null ? `$${Number(canon).toLocaleString('es-CO')} COP/mes` : '—'} {deposito ? `+ depósito $${Number(deposito).toLocaleString('es-CO')}` : ''}</p>
        <div className="flex gap-2 flex-wrap text-xs sm:text-sm min-w-0">
          <span className="bg-gray-100 px-2.5 py-1 rounded-full truncate max-w-full">Zona: {zona}</span>
          <span className="bg-gray-100 px-2.5 py-1 rounded-full truncate max-w-full">{pub.tipo_inmueble}</span>
          {pub.servicios?.map(s=> <span key={s} className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full truncate max-w-[160px] border border-indigo-100">{s}</span>)}
        </div>
        {pub.fotos && Array.isArray(pub.fotos) && pub.fotos.length>0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pub.fotos.slice(0,4).map((url,i)=> (
              <div key={i} className="aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
                <img src={url} alt={`Foto ${i+1}`} className="w-full h-full object-cover" loading="lazy" onError={e=>e.currentTarget.style.display='none'} />
              </div>
            ))}
          </div>
        )}
        <p className="text-sm break-words"><b>Reglas:</b> <span className="break-words">{pub.reglas_convivencia||pub.reglas || '—'}</span></p>
        <p className="text-sm break-words"><b>Dirección ref:</b> {pub.direccion_referencial} • <b>Distancia:</b> {dist != null ? `${dist} m` : '—'} (Haversine, no ruteo a pie)</p>
        <div className="overflow-hidden rounded-xl">
          <MapaZona zona={zona} dist_m={dist ?? 320} campus={{lat:2.443,lng:-76.606}} />
        </div>
        {hasTel ? <a href={wa} target="_blank" rel="noopener" className="inline-flex w-full sm:w-auto justify-center bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-medium transition">Contactar por WhatsApp (HU-008)</a> : <p className="text-sm text-red-500 break-words">{!isActivo ? `No contactable — Estado ${pub.estado} (HU-003 C3)` : 'Sin WhatsApp autorizado (HU-008 C1) — no se muestra botón'}</p>}
        <p className="text-xs text-gray-400 break-words">Fotos: {numFotos} • Vigencia 30d • Estado: {pub.estado}</p>
      </div>
      <div className="min-w-0"><Indice indice={pub.indice_confianza||0} desglose={pub.desglose||{completitud:40,telefono:20,fotos:15,vigencia:15,reportes:10}}/></div>
    </div>
  )
}
