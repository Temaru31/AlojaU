// Carga diferida de la casa 3D del hero (solo si el dispositivo la soporta).
import { lazy, Suspense } from 'react'
import useMediaQuery from '../../hooks/useMediaQuery'

// Three.js (~736 kB) solo se descarga en desktop. El import
// estático anterior metía el 3D en el bundle inicial y el efecto de Casa3D
// lo ejecutaba incluso oculto con `hidden` (también en móvil).
const Casa3D = lazy(() => import('../../components/Casa3D'))


// Gate del hero 3D: fuera de desktop no se monta nada (cero bytes de three).
export default function Casa3DGate() {
  const esDesktop = useMediaQuery('(min-width: 1024px)')
  if (!esDesktop) return null
  return (
    <Suspense fallback={<div className="min-h-[220px]" aria-hidden="true" />}>
      <Casa3D compact />
    </Suspense>
  )
}
