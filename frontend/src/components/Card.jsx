import { useRef, useState } from 'react'
import { formatDistancia } from '../utils/formatters'
import { formatTiempoCaminando } from '../utils/formatters'
import SmartImage from './SmartImage'
import BadgeConfianza from './BadgeConfianza'
import { notifyToast } from './Toast'
import { useFavoritos } from '../contexts/FavoritosContext'
import { useComparar } from '../contexts/CompararContext'

export default function Card({ pub, lugarNombre = null }) {
  const favHook = useFavoritos()
  const compHook = useComparar()
  // NUEVO(<=3ln): indice null -> 0 para no mostrar "— Básico"
  const indice = pub.indice_confianza ?? 0

  const canon = pub.canon_mensual ?? pub.canon
  // BUG-08: fallback unificado a "No informado"
  const zona = pub.zona_nombre || pub.zona || 'No informado'
  const dist = pub.distancia_geodesica_m ?? pub.dist_m
  // BUG-08: num_fotos real (??, no valor inventado)
  const numFotos = Array.isArray(pub.fotos) ? pub.fotos.length : (pub.num_fotos ?? (typeof pub.fotos === 'number' ? pub.fotos : 0))
  const cover = Array.isArray(pub.fotos) ? pub.fotos[0] : null
  const tiempo = formatTiempoCaminando(dist)
  // 004 POIs: badge destacado "A X m · Y min a pie de [Lugar]" cuando hay
  // contexto de cercanía; sin lugar se conserva el texto legado.
  const distText = dist != null ? `${formatDistancia(dist)}${tiempo ? ` · ${tiempo}` : ''}` : 'No informado'
  const badgeCercania = lugarNombre && dist != null
    ? `A ${formatDistancia(dist)}${tiempo ? ` · ${tiempo}` : ''} de ${lugarNombre}`
    : null
  const isFav = favHook.isFav(pub.id)
  const isComp = compHook.isSelected(pub.id)

  // Tarea 2 (v4): carousel táctil en la tarjeta (sin abrir el detalle).
  const fotos = Array.isArray(pub.fotos) ? pub.fotos : []
  const [fotoIdx, setFotoIdx] = useState(0)
  const touchX = useRef(null)
  const huboSwipe = useRef(false)
  const totalFotos = fotos.length
  const irFoto = (dir) => {
    if (totalFotos < 2) return
    setFotoIdx((i) => (i + dir + totalFotos) % totalFotos)
  }
  const onTouchStart = (e) => {
    huboSwipe.current = false
    touchX.current = e.touches?.[0]?.clientX ?? null
  }
  const onTouchEnd = (e) => {
    if (touchX.current == null) return
    const fin = e.changedTouches?.[0]?.clientX
    if (fin == null) return
    const dx = fin - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 40 || totalFotos < 2) return
    huboSwipe.current = true
    e.stopPropagation()
    irFoto(dx < 0 ? 1 : -1)
  }
  // Tras un swipe, el tap que sigue NO debe navegar al detalle (la tarjeta vive en un <Link>).
  const frenarClickPostSwipe = (e) => {
    if (huboSwipe.current) {
      huboSwipe.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div className="card-hover group p-0 overflow-hidden min-w-0">
      {/* Image + carousel táctil */}
      <div
        className="h-36 sm:h-40 w-full overflow-hidden bg-gradient-to-br from-navy-50 to-neutral-100 relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClickCapture={frenarClickPostSwipe}
      >
        {cover ? (
          <SmartImage
            key={fotos[fotoIdx] || cover}
            src={fotos[fotoIdx] || cover}
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
        {/* Badge minimalista de confianza (tooltip con el detalle) */}
        <div className="absolute top-3 left-3">
          <BadgeConfianza indice={indice} />
        </div>
        {/* Dots + contador del carousel (stopPropagation: no navegan al detalle) */}
        {totalFotos > 1 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5" role="group" aria-label={`Fotos: ${fotoIdx + 1} de ${totalFotos}`}>
            <span className="text-[10px] font-bold text-white bg-black/50 rounded-full px-1.5 py-0.5" aria-hidden="true">
              {fotoIdx + 1}/{totalFotos}
            </span>
            {fotos.slice(0, 5).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ver foto ${i + 1}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFotoIdx(i) }}
                className={`w-2 h-2 rounded-full transition ${i === Math.min(fotoIdx, 4) ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}
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
            {badgeCercania ? (
              <span className="font-semibold text-navy-700">{badgeCercania}</span>
            ) : distText}
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
