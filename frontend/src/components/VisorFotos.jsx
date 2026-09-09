// VisorFotos - lightbox accesible, responsive, iterativo
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import SmartImage from './SmartImage'

export default function VisorFotos({ fotos, initialIndex = 0, onClose }) {
  const total = fotos.length
  const [index, setIndex] = useState(initialIndex)

  // import useState aqui
  const goPrev = useCallback(()=> setIndex(i=> (i-1+total)%total), [total])
  const goNext = useCallback(()=> setIndex(i=> (i+1)%total), [total])

  useEffect(()=>{
    setIndex(initialIndex)
  }, [initialIndex])

  useEffect(()=>{
    const onKey = (e)=>{
      if(e.key==='Escape') onClose()
      if(e.key==='ArrowLeft') goPrev()
      if(e.key==='ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow='hidden'
    return ()=>{ window.removeEventListener('keydown', onKey); document.body.style.overflow='' }
  }, [onClose, goPrev, goNext])

  if(total===0) return null
  const url = fotos[index]

  // BUG-01: portal a document.body + z-[2000] para quedar por encima de
  // los panes Leaflet (z 400-1000) y del nav sticky (z-50)
  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Visor de fotos">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-3 sm:px-4 py-3 text-white">
        <span className="text-sm font-medium">{index+1} / {total} • {total} fotos • Vigencia 30d</span>
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noopener" className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full border border-white/20">Abrir original</a>
          <a href={url} download className="hidden sm:block text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full border border-white/20">Descargar</a>
          <button onClick={onClose} aria-label="Cerrar visor" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg">×</button>
        </div>
      </div>

      {/* Imagen */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <button onClick={goPrev} aria-label="Anterior" className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center border border-white/20">‹</button>
        <SmartImage key={url} src={url} alt={`Foto ${index+1} de ${total}`} className="max-w-full max-h-[70vh] sm:max-h-[75vh] object-contain rounded-lg shadow-2xl bg-transparent" eager />
        <button onClick={goNext} aria-label="Siguiente" className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center border border-white/20">›</button>
      </div>

      {/* Thumbs */}
      <div className="relative z-10 px-2 sm:px-4 pb-3 sm:pb-4">
        <div className="flex gap-2 overflow-x-auto justify-center py-2 scrollbar-thin">
          {fotos.map((f,i)=> (
            <button key={i} onClick={()=> setIndex(i)} aria-label={`Ver foto ${i+1}`} className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 bg-neutral-800 ${i===index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <SmartImage src={f} alt={`Thumb ${i+1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-white/60 mt-1">Usa ← → o desliza • ESC para cerrar</p>
      </div>

      {/* Click fuera cierra */}
      <button aria-label="Cerrar al hacer clic fuera" onClick={onClose} className="absolute inset-0 z-0" tabIndex={-1} />
    </div>,
    document.body
  )
}
