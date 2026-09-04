// GaleriaFotos - responsive +N + visor
// Mobile: 1 foto + +N (ej. +3 si hay 4), Desktop: 4 fotos grid + +N (ej. +6 si hay 10)
import { useState } from 'react'
import VisorFotos from './VisorFotos'

export default function GaleriaFotos({ fotos = [], titulo = '' }) {
  const [visorOpen, setVisorOpen] = useState(false)
  const [visorIndex, setVisorIndex] = useState(0)

  if (!fotos || fotos.length === 0) {
    return <div className="bg-gray-100 rounded-xl aspect-[4/3] flex items-center justify-center text-gray-400 text-sm">Sin fotos</div>
  }

  const total = fotos.length
  const fallback = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop'

  const openAt = (idx) => { setVisorIndex(idx); setVisorOpen(true) }

  // Mobile: 1 visible, Desktop: 4 visibles
  const mobileVisible = 1
  const desktopVisible = 4
  const mobileExtra = total - mobileVisible
  const desktopExtra = total - desktopVisible

  return (
    <>
      {/* Mobile: 1 grande + +N */}
      <div className="block sm:hidden">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100 cursor-pointer" onClick={()=> openAt(0)}>
          <img
            src={fotos[0]}
            alt={`${titulo} foto 1 de ${total}`}
            className="w-full h-full object-cover hover:scale-[1.02] transition"
            onError={e=> { e.currentTarget.src=fallback; e.currentTarget.onerror=null }}
          />
          {total > mobileVisible && (
            <button onClick={(e)=>{ e.stopPropagation(); openAt(mobileVisible) }} className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-white">
              <span className="text-2xl font-bold">+{mobileExtra}</span>
              <span className="text-xs">ver más</span>
            </button>
          )}
          <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">{total} fotos</span>
        </div>
        {/* mini thumbs mobile si hay 2-3 */}
        {total>1 && total<=3 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {fotos.slice(1,3).map((url,i)=> (
              <div key={i} className="aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer" onClick={()=> openAt(i+1)}>
                <img src={url} alt={`${titulo} mini ${i+2}`} className="w-full h-full object-cover" onError={e=> e.currentTarget.src=fallback} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: 4 en grid */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-2">
        {fotos.slice(0, desktopVisible).map((url, idx)=> {
          const isLastVisible = idx === desktopVisible -1
          const showExtra = isLastVisible && desktopExtra > 0
          return (
            <div key={idx} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100 cursor-pointer group" onClick={()=> openAt(idx)}>
              <img
                src={url}
                alt={`${titulo} foto ${idx+1} de ${total}`}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition"
                onError={e=> e.currentTarget.src=fallback}
              />
              {showExtra && (
                <button onClick={(e)=>{ e.stopPropagation(); openAt(desktopVisible) }} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white hover:bg-black/70 transition">
                  <span className="text-2xl sm:text-3xl font-bold">+{desktopExtra}</span>
                  <span className="text-xs sm:text-sm">fotos más</span>
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
