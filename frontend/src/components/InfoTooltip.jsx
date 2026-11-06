// InfoTooltip — Ayuda contextual híbrida (M1).
// Desktop con cursor: aparece en hover/focus. Táctil: tap para abrir y
// cierra al tocar fuera o con Escape. Accesible (aria-describedby + Esc).
// Uso: <InfoTooltip texto="..." /> junto a un título o etiqueta.
import { useEffect, useId, useRef, useState } from 'react'

export default function InfoTooltip({ texto }) {
  const [fijado, setFijado] = useState(false) // tap táctil
  const [hover, setHover] = useState(false) // cursor / foco
  const id = useId()
  const ref = useRef(null)
  const visible = fijado || hover

  useEffect(() => {
    if (!fijado) return
    const alClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setFijado(false)
    }
    const alEscape = (e) => {
      if (e.key === 'Escape') setFijado(false)
    }
    document.addEventListener('mousedown', alClickFuera)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClickFuera)
      document.removeEventListener('keydown', alEscape)
    }
  }, [fijado])

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label="Más información"
        aria-expanded={visible}
        aria-describedby={id}
        onClick={() => setFijado(v => !v)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="w-5 h-5 min-w-[20px] rounded-full bg-neutral-100 text-neutral-500 hover:text-navy-700 hover:bg-navy-50 text-[11px] font-bold inline-flex items-center justify-center transition"
      >
        i
      </button>
      <span
        id={id}
        role={visible ? 'tooltip' : undefined}
        aria-hidden={!visible}
        className={`absolute z-30 bottom-7 left-1/2 -translate-x-1/2 w-52 rounded-lg border border-neutral-200 bg-navy-900 text-white text-[11px] leading-relaxed px-3 py-2 shadow-xl transition-opacity ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {texto}
      </span>
    </span>
  )
}
