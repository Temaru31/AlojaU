// useMediaQuery — Gate responsive para carga condicional (Bloque 1).
// Solo monta (y descarga) componentes pesados como Casa3D/three.js cuando el
// viewport cumple la query. Seguro en SSR/jsdom (sin matchMedia -> false) y
// reacciona a cambios (rotación, resize, DevTools). Uso:
//   const esDesktop = useMediaQuery('(min-width: 1024px)')
//   {esDesktop && <Suspense fallback={...}><Casa3DLazy /></Suspense>}
import { useEffect, useState } from 'react'

export default function useMediaQuery(query) {
  const [cumple, setCumple] = useState(() => {
    try {
      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(query).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(query)
    const alCambiar = (e) => setCumple(!!e.matches)
    setCumple(!!mql.matches)
    // addEventListener moderno con fallback a addListener (Safari <14).
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', alCambiar)
      return () => mql.removeEventListener('change', alCambiar)
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(alCambiar)
      return () => mql.removeListener(alCambiar)
    }
    return undefined
  }, [query])

  return cumple
}
