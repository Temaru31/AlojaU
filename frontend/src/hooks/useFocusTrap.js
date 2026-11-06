// useFocusTrap — Atrapamiento + restauración de foco (Bloque 3, WCAG 2.1 AA).
// Mientras `activo`, Tab/Shift+Tab ciclan solo entre los focos del `ref`
// (botones, links, inputs no deshabilitados); al desactivar/desmontar, el
// foco vuelve al elemento que abrió el diálogo. Sin dependencias.
// Uso:
//   const ref = useRef(null)
//   useFocusTrap(ref, abierto)
//   <div ref={ref} role="dialog" ...>…</div>
import { useEffect } from 'react'

const SELECTOR_FOCO = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focosDe(nodo) {
  if (!nodo || typeof nodo.querySelectorAll !== 'function') return []
  return Array.from(nodo.querySelectorAll(SELECTOR_FOCO)).filter((el) => {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false
    try {
      const r = el.getClientRects()
      // En jsdom no hay layout (rects vacías): se acepta por selector.
      return r.length === 0 || Array.from(r).some((x) => x.width > 0 && x.height > 0)
    } catch {
      return true
    }
  })
}

export default function useFocusTrap(ref, activo) {
  useEffect(() => {
    if (!activo) return undefined
    const nodo = ref?.current
    if (!nodo) return undefined
    // Restaura al disparador al cerrar (se captura ANTES de mover el foco).
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const alPulsar = (e) => {
      if (e.key !== 'Tab') return
      const focos = focosDe(ref.current)
      if (focos.length === 0) {
        e.preventDefault()
        return
      }
      const primero = focos[0]
      const ultimo = focos[focos.length - 1]
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alPulsar, true)
    // Foco inicial al primer control (sin robarlo si ya está dentro).
    if (nodo && !nodo.contains(document.activeElement)) {
      const focos = focosDe(nodo)
      if (focos.length > 0) focos[0].focus()
    }
    return () => {
      document.removeEventListener('keydown', alPulsar, true)
      try {
        if (anterior && document.contains(anterior)) anterior.focus()
      } catch { /* el disparador ya no existe: nada que restaurar */ }
    }
  }, [ref, activo])
}
