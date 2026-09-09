// GaleriaFotos - responsive +N + visor
// Mobile: 1 foto + +N (ej. +3 si hay 4), Desktop: 4 fotos grid + +N (ej. +6 si hay 10)
import { useState } from 'react'
import VisorFotos from './VisorFotos'
import SmartImage from './SmartImage'

export default function GaleriaFotos({ fotos = [], titulo = '' }) {
  const [visorOpen, setVisorOpen] = useState(false)
  const [visorIndex, setVisorIndex] = useState(0)

  if (!fotos || fotos.length === 0) {
    return <div className="bg-neutral-100 rounded-xl aspect-[4/3] flex items-center justify-center text-gray-400 text-sm">Sin fotos</div>
  }

  const total = fotos.length

  const openAt = (idx) => { setVisorIndex(idx); setVisorOpen(true) }

  // Mobile: 1 visible, Desktop: 4 visibles
  const mobileVisible = 1
  const desktopVisible = 4
  const mobileExtra = total - mobileVisible
  const desktopExtra = total - desktopVisible

  return (
    <>
      {/* Mobile: 1 grande + badge +N (no tapa la foto) */}
      <div className="block sm:hidden">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100 cursor-pointer" onClick={()=> openAt(0)}>
          <SmartImage
            src={fotos[0]}
            alt={`${titulo} foto 1 de ${total}`}
            className="w-full h-full object-cover hover:scale-[1.02] transition"
            eager
          />
          {total > mobileVisible && (
            <button onClick={(e)=>{ e.stopPropagation(); openAt(mobileVisible) }} aria-label={`Ver ${mobileExtra} fotos más`} className="absolute bottom-2 left-2 bg-black/60 hover:bg-black/70 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm transition">
              +{mobileExtra} ver más
            </button>
          )}
          <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">{total} fotos</span>
        </div>
        {/* mini thumbs mobile si hay 2-3 */}
        {total>1 && total<=3 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {fotos.slice(1,3).map((url,i)=> (
              <div key={i} className="aspect-square overflow-hidden rounded-lg bg-neutral-100 cursor-pointer" onClick={()=> openAt(i+1)}>
                <SmartImage src={url} alt={`${titulo} mini ${i+2}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: 4 en grid, +N como badge esquina (no tapa) */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-2">
        {fotos.slice(0, desktopVisible).map((url, idx)=> {
          const isLastVisible = idx === desktopVisible -1
          const showExtra = isLastVisible && desktopExtra > 0
          return (
            <div key={idx} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100 cursor-pointer group" onClick={()=> openAt(idx)}>
              <SmartImage
                src={url}
                alt={`${titulo} foto ${idx+1} de ${total}`}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition"
              />
              {showExtra && (
                <button onClick={(e)=>{ e.stopPropagation(); openAt(desktopVisible) }} aria-label={`Ver ${desktopExtra} fotos más`} className="absolute bottom-2 left-2 bg-black/60 hover:bg-black/70 text-white text-xs sm:text-sm px-2.5 py-1 rounded-full backdrop-blur-sm transition">
                  +{desktopExtra} fotos
                </button>
              )}
              {idx===0 && total===4 && (<span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">{total} fotos</span>)}
            </div>
          )
        })}
      </div>

      {/* Contador discreto desktop si total no es 4 */}
      {total !== 4 && (
        <p className="hidden sm:block text-xs text-gray-400 mt-1">{total} fotos • Haz clic para abrir visor • {total>desktopVisible ? `+${desktopExtra} ocultas en grid, visibles en visor` : 'todas visibles'}</p>
      )}

      {visorOpen && <VisorFotos fotos={fotos} initialIndex={visorIndex} onClose={()=> setVisorOpen(false)} />}
    </>
  )
}
