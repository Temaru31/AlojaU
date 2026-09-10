import { getLabelIndice, formatDistancia } from '../utils/formatters'
import { formatTiempoCaminando } from '../utils/formatters'
import SmartImage from './SmartImage'
import { notifyToast } from './Toast'
import { useFavoritos } from '../contexts/FavoritosContext'
import { useComparar } from '../contexts/CompararContext'

export default function Card({ pub }) {
  const favHook = useFavoritos()
  const compHook = useComparar()
  // NUEVO(<=3ln): indice null -> 0 para no mostrar "— Básico"
  const indice = pub.indice_confianza ?? 0
  const level = indice >= 80 ? 'high' : indice >= 50 ? 'mid' : 'low'

  // UX: semántica visual Alto=verde, Medio=naranja (no amarillo: es el corporativo), Bajo=rojo.
  const badgeStyles = {
    high: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    mid: 'bg-orange-50 text-orange-700 border border-orange-200',
    low: 'bg-red-50 text-red-700 border border-red-200',
  }

  const dotStyles = {
    high: 'bg-emerald-500',
    mid: 'bg-orange-500',
    low: 'bg-red-500',
  }

  const canon = pub.canon_mensual ?? pub.canon
  // BUG-08: fallback unificado a "No informado"
  const zona = pub.zona_nombre || pub.zona || 'No informado'
  const dist = pub.distancia_geodesica_m ?? pub.dist_m
  // BUG-08: num_fotos real (??, no valor inventado)
  const numFotos = Array.isArray(pub.fotos) ? pub.fotos.length : (pub.num_fotos ?? (typeof pub.fotos === 'number' ? pub.fotos : 0))
  const cover = Array.isArray(pub.fotos) ? pub.fotos[0] : null
  const tiempo = formatTiempoCaminando(dist)
  // BUG-10: usa formatDistancia (null -> "No informado")
  const distText = dist != null ? `${formatDistancia(dist)}${tiempo ? ` · ${tiempo}` : ''}` : 'No informado'
  const isFav = favHook.isFav(pub.id)
  const isComp = compHook.isSelected(pub.id)

  return (
    <div className="card-hover group p-0 overflow-hidden min-w-0">
      {/* Image */}
      <div className="h-36 sm:h-40 w-full overflow-hidden bg-gradient-to-br from-navy-50 to-neutral-100 relative">
        {cover ? (
          <SmartImage
            src={cover}
            alt={pub.titulo}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
            eager={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-10 h-10 text-navy-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          </div>
        )}
        {/* Confidence badge */}
        <div className={`absolute top-3 left-3 badge ${badgeStyles[level]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[level]}`} />
          {indice} — {getLabelIndice(indice)}
        </div>
        {/* Favorito */}
        <button
          type="button"
          aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          aria-pressed={isFav}
          onClick={(e) => {
            e.preventDefault(); e.stopPropagation()
            favHook.toggle(pub.id)
            notifyToast(isFav ? 'Quitado de favoritos' : 'Guardado en favoritos', isFav ? undefined : '/favoritos')
          }}
          className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-sm backdrop-blur-sm border transition active:scale-90 ${isFav ? 'bg-red-500 text-white border-red-500' : 'bg-white/90 text-neutral-600 border-white hover:bg-white'}`}
          title={isFav ? 'En favoritos' : 'Añadir a favoritos'}
        >
          {isFav ? '♥' : '♡'}
        </button>
        {/* Comparar */}
        <button
          type="button"
          aria-label={isComp ? 'Quitar de comparar' : 'Añadir a comparar'}
          aria-pressed={isComp}
          onClick={(e) => {
            e.preventDefault(); e.stopPropagation()
            compHook.toggle(pub.id)
            if (!isComp) notifyToast('Añadido a comparar', '/comparar')
          }}
          className={`absolute bottom-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold backdrop-blur-sm border transition active:scale-90 ${isComp ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/90 text-neutral-600 border-white hover:bg-white'}`}
          title={isComp ? 'En comparar' : 'Añadir a comparar (máx 3)'}
        >
          {isComp ? '✓' : '+'}
        </button>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-display font-semibold text-navy-900 text-sm leading-snug line-clamp-2 break-words group-hover:text-navy-600 transition-colors">
            {pub.titulo}
          </h3>
        </div>

        {/* UX-AUDIT P0: canon null -> "No informado" (Detalle ya lo hace; $0 engaña) */}
        <p className="text-lg font-bold text-navy-800 mb-2">
          {canon != null
            ? <>${Number(canon).toLocaleString('es-CO')} <span className="text-xs font-normal text-neutral-400">COP/mes</span></>
            : <span className="text-sm font-medium text-neutral-400">No informado</span>}
        </p>

        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {zona}
          </span>
          <span className="text-neutral-300">|</span>
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            {distText}
          </span>
        </div>

        {/* UX: sin etiqueta de estado interno (ACTIVO/PENDIENTE es de BD, no del estudiante) */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
          <span className="text-xs text-neutral-400">{numFotos} fotos</span>
        </div>
      </div>
    </div>
  )
}
