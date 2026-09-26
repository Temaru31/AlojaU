// CarruselFotos — Galería táctil solo móvil (R7).
// Scroll horizontal nativo con scroll-snap (gesto swipe sin librerías),
// contador `i/X` abajo-derecha, flechas prev/next y tap que abre el visor.
// Las acciones rápidas (fav/comparar) llegan por `acciones` y flotan arriba-derecha.
// Uso: <CarruselFotos fotos={[]} titulo="" acciones={<BotonesFlotantes/>} />
// Solo se monta en móvil (`sm:hidden` lo decide el padre); en jsdom es inerte.
import { useRef, useState, useCallback } from 'react'
import VisorFotos from './VisorFotos'
import SmartImage from './SmartImage'

export default function CarruselFotos({ fotos = [], titulo = '', acciones = null }) {
  const trackRef = useRef(null)
  const [idx, setIdx] = useState(0)
  const [visorOpen, setVisorOpen] = useState(false)
  const [visorIndex, setVisorIndex] = useState(0)
  const total = Array.isArray(fotos) ? fotos.length : 0

  const alScroll = useCallback(() => {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIdx(Math.max(0, Math.min(total - 1, i)))
  }, [total])

  const irA = useCallback((i) => {
    const el = trackRef.current
    const next = Math.max(0, Math.min(total - 1, i))
    if (el && el.clientWidth) {
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }
    setIdx(next)
  }, [total])

  const abrir = useCallback((i) => {
    setVisorIndex(i)
    setVisorOpen(true)
  }, [])

  if (!total) {
    return <div className="bg-neutral-100 rounded-xl aspect-[4/3] flex items-center justify-center text-neutral-400 text-sm">Sin fotos</div>
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={alScroll}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-xl bg-neutral-100 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-roledescription="carrusel"
        aria-label={`${titulo}: ${total} fotos, desliza para ver más`}
      >
        {fotos.map((url, i) => (
          <button
            key={url || i}
            type="button"
            onClick={() => abrir(i)}
            aria-label={`Abrir foto ${i + 1} de ${total}`}
            className="relative shrink-0 w-full snap-center aspect-[4/3] overflow-hidden bg-neutral-100"
          >
            <SmartImage src={url} alt={`${titulo} foto ${i + 1} de ${total}`} className="w-full h-full object-cover" eager={i === 0} />
          </button>
        ))}
      </div>

      {/* Acciones rápidas flotantes sobre la imagen */}
      {acciones && (
        <div className="absolute top-2 right-2 flex gap-2">
          {acciones}
        </div>
      )}

      {/* Contador numérico inferior-derecha */}
      <span
        className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm"
        aria-label={`Foto ${idx + 1} de ${total}`}
        aria-live="polite"
      >
        {idx + 1}/{total}
      </span>

      {/* Prev/next táctiles (44px) */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => irA(idx - 1)}
            disabled={idx === 0}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white text-lg flex items-center justify-center backdrop-blur-sm active:bg-black/70 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => irA(idx + 1)}
            disabled={idx === total - 1}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white text-lg flex items-center justify-center backdrop-blur-sm active:bg-black/70 disabled:opacity-30"
          >
            ›
          </button>
        </>
      )}

      {visorOpen && <VisorFotos fotos={fotos} initialIndex={visorIndex} onClose={() => setVisorOpen(false)} />}
    </div>
  )
}
