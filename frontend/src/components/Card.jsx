// HU-001/003: Tarjeta de publicación con índice de confianza - FIX overflow + responsive
export default function Card({ pub }) {
  const color = pub.indice_confianza >= 80 ? 'bg-green-100 text-green-700' : pub.indice_confianza >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
  const canon = pub.canon_mensual ?? pub.canon
  const zona = pub.zona_nombre || pub.zona || '—'
  const dist = pub.distancia_geodesica_m ?? pub.dist_m
  const numFotos = Array.isArray(pub.fotos) ? pub.fotos.length : (pub.num_fotos ?? pub.fotos ?? 0)
  const cover = Array.isArray(pub.fotos) ? pub.fotos[0] : null
  const distText = dist != null ? `${typeof dist === 'number' ? dist.toLocaleString('es-CO') : dist}m` : '—'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col h-full group min-w-0">
      {cover && (
        <div className="h-36 sm:h-40 w-full overflow-hidden bg-gray-100">
          <img src={cover} alt={pub.titulo} className="w-full h-full object-cover group-hover:scale-[1.02] transition" loading="lazy"
               onError={(e)=> e.currentTarget.style.display='none'} />
        </div>
      )}
      <div className="p-3 sm:p-4 flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className={`text-[11px] sm:text-xs px-2 py-1 rounded-full font-medium shrink-0 ${color}`}>Confianza {pub.indice_confianza} • {pub.indice_confianza>=80?'Alto':pub.indice_confianza>=50?'Medio':'Básico'}</span>
          <span className="text-[11px] sm:text-xs text-gray-500 truncate min-w-0 text-right">{distText} • {zona}</span>
        </div>
        <h3 className="font-semibold text-sm sm:text-[15px] leading-tight line-clamp-2 break-words min-w-0">{pub.titulo}</h3>
        <p className="text-indigo-600 font-bold text-sm sm:text-base truncate">{canon != null ? `$${Number(canon).toLocaleString('es-CO')} COP/mes` : '—'}</p>
        <p className="text-[11px] sm:text-xs text-gray-400 truncate">{numFotos} fotos • {pub.estado || 'ACTIVO'} • Vigencia 30d</p>
        {pub.servicios && (
          <p className="text-[11px] text-gray-500 truncate hidden sm:block">{Array.isArray(pub.servicios) ? pub.servicios.slice(0,3).join(' • ') : ''}</p>
        )}
      </div>
    </div>
  )
}
