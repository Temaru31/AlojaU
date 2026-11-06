// Hero de la búsqueda con la «linterna» que sigue al cursor (solo desktop).
import { useEffect, useRef } from 'react'
import Casa3DGate from '../buscar/Casa3DGate'

export default function HeroBuscar({ ciudadNombre }) {
  // Linterna del Hero: un halo blanco sigue al cursor con inercia suave.
  // Sin re-renders (mutación directa + RAF) y desactivado en táctil o
  // con movimiento reducido.
  const heroRef = useRef(null)
  const luzRef = useRef(null)
  useEffect(() => {
    const hero = heroRef.current
    const luz = luzRef.current
    if (!hero || !luz) return
    if (window.matchMedia?.('(hover: none)').matches) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let activo = false
    const objetivo = { x: 0, y: 0 }
    const actual = { x: 0, y: 0 }

    const pintar = () => {
      if (!activo) return
      actual.x += (objetivo.x - actual.x) * 0.18
      actual.y += (objetivo.y - actual.y) * 0.18
      luz.style.background = `radial-gradient(circle 280px at ${actual.x}px ${actual.y}px, rgba(255,255,255,0.22), rgba(255,255,255,0.06) 45%, transparent 70%)`
      raf = requestAnimationFrame(pintar)
    }
    const posicion = (e) => {
      const rect = hero.getBoundingClientRect()
      objetivo.x = e.clientX - rect.left
      objetivo.y = e.clientY - rect.top
    }
    const entrar = (e) => {
      posicion(e)
      actual.x = objetivo.x
      actual.y = objetivo.y
      activo = true
      luz.style.opacity = '1'
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(pintar)
    }
    const salir = () => {
      activo = false
      cancelAnimationFrame(raf)
      luz.style.opacity = '0'
    }

    hero.addEventListener('mouseenter', entrar)
    hero.addEventListener('mousemove', posicion)
    hero.addEventListener('mouseleave', salir)
    return () => {
      activo = false
      cancelAnimationFrame(raf)
      hero.removeEventListener('mouseenter', entrar)
      hero.removeEventListener('mousemove', posicion)
      hero.removeEventListener('mouseleave', salir)
    }
  }, [])

  return (
    <section ref={heroRef} className="relative overflow-hidden bg-navy-950 md:max-h-[280px]">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, #0c1426 0%, #14213D 42%, #1e3460 78%, #263A5A 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 70% at 12% 6%, rgba(59,82,127,0.55), transparent 65%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 45% 60% at 88% 55%, rgba(244,185,66,0.10), transparent 65%)' }}
      />
      <div className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(12,20,38,0.55), transparent 32%)' }}
      />
      <div className="container-main relative py-8 md:py-10">
        <div className="grid items-center gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full mb-3">
              <div className="w-1.5 h-1.5 bg-gold-400 rounded-full" />
              <span className="text-xs font-medium text-gold-300 tracking-wide uppercase">{ciudadNombre}</span>
            </div>
            <h1 className="font-display text-2xl md:text-[2rem] font-extrabold text-white leading-tight tracking-tight mb-2 text-balance">
              Encuentra tu espacio ideal,{' '}
              <span className="text-gold-400">donde lo necesitas</span>
            </h1>
            <p className="text-navy-300 text-sm md:text-base leading-relaxed max-w-xl">
              Habitaciones, apartaestudios y viviendas verificadas con ubicación real. Compara opciones, revisa el índice de confianza y conecta directo sin intermediarios.
            </p>
          </div>
          <div className="hidden lg:block">
            {/* Gate: sin desktop no se monta (ni descarga) el 3D. El
                fallback reserva alto para evitar CLS al hidratar. */}
            <Casa3DGate />
          </div>
        </div>
      </div>
      <div
        ref={luzRef}
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300"
        style={{ mixBlendMode: 'overlay' }}
      />
    </section>
  )
}
