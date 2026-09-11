import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import Card from '../components/Card'
import Casa3D from '../components/Casa3D'
import CercanoA, { etiquetaLugar } from '../components/CercanoA'
import Filtros from '../components/Filtros'
import Paginacion from '../components/Paginacion'
import SearchBar from '../components/SearchBar'

export default function Buscar() {
  const [campus, setCampus] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()
  // 004 POIs: sin ?campus_id= no hay filtro de cercanía (estado inicial vacío).
  // NaN-safe: un valor manual inválido (?campus_id=abc) equivale a "Todos".
  const campusIdRaw = searchParams.get('campus_id')
  const campusIdNum = campusIdRaw != null ? Number(campusIdRaw) : NaN
  const campusId = Number.isInteger(campusIdNum) && campusIdNum >= 1 ? campusIdNum : null
  const page = Number(searchParams.get('page') || 1)
  const q = searchParams.get('q') || ''
  const [filtros, setFiltros] = useState({
    min: searchParams.get('precio_min') || '',
    max: searchParams.get('precio_max') || '',
    tipo: searchParams.get('tipo') || '',
    servicios: searchParams.get('servicios') || '',
  })
  // OLA4: string primitivo estable (el objeto searchParams cambia de identidad
  // y provocaba doble-fetch). El efecto de resultados depende de este string.
  const queryString = searchParams.toString()
  const [pubs, setPubs] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const setCampusId = (id) => {
    const params = new URLSearchParams(searchParams)
    if (id == null || id === '') params.delete('campus_id')
    else params.set('campus_id', id)
    params.set('page', 1)
    setSearchParams(params)
  }

  const setQ = (texto) => {
    const params = new URLSearchParams(searchParams)
    texto.trim() ? params.set('q', texto.trim()) : params.delete('q')
    params.set('page', 1)
    if (params.toString() !== searchParams.toString()) setSearchParams(params)
  }

  const limpiarTodo = () => {
    setFiltros({ min: '', max: '', tipo: '', servicios: '' })
    setQ('')
  }

  const setPage = (p) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', p)
    setSearchParams(params)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // debounce filtros -> URL (400ms). El ref evita re-escribir la URL cuando
  // el efecto se re-dispara por cambios ajenos (q, page) y el queryString en
  // deps evita pisarlos con un closure rancio.
  const filtrosAplicados = useRef(null)
  useEffect(() => {
    const firma = JSON.stringify([filtros.min, filtros.max, filtros.tipo, filtros.servicios])
    if (filtrosAplicados.current === firma) return
    const t = setTimeout(() => {
      filtrosAplicados.current = firma
      const params = new URLSearchParams(queryString)
      filtros.min ? params.set('precio_min', filtros.min) : params.delete('precio_min')
      filtros.max ? params.set('precio_max', filtros.max) : params.delete('precio_max')
      filtros.tipo ? params.set('tipo', filtros.tipo) : params.delete('tipo')
      filtros.servicios ? params.set('servicios', filtros.servicios) : params.delete('servicios')
      params.set('page', 1)
      if (params.toString() !== queryString) {
        setSearchParams(params)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [filtros.min, filtros.max, filtros.tipo, filtros.servicios, queryString])

  useEffect(() => {
    api.get('/api/campus')
      .then(r => setCampus(r.data))
      .catch(() => setCampus([{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcan' }]))
  }, [])

  // OLA4: AbortController + deps primitivas estables (sin objeto searchParams).
  // La respuesta tardía de una búsqueda anterior ya no pisa a la actual.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const q = new URLSearchParams(queryString)
    const params = {
      campus_id: campusId ?? undefined,
      precio_min: q.get('precio_min') || undefined,
      precio_max: q.get('precio_max') || undefined,
      tipo: q.get('tipo') || undefined,
      servicios: q.get('servicios') || undefined,
      q: q.get('q') || undefined,
      page, size: 9
    }
    api.get('/api/publicaciones', { params, signal: controller.signal })
      .then(r => {
        const data = r.data
        if (Array.isArray(data)) {
          setPubs(data); setTotal(data.length); setPages(1)
        } else {
          setPubs(data.items || []); setTotal(data.total || 0); setPages(data.pages || 1)
        }
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED') return
        setError('No se pudo cargar publicaciones. Intenta de nuevo.'); setPubs([])
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [campusId, page, queryString])

  const currentCampus = campus.find(c => c.id == campusId)

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
    <div>
      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden bg-navy-950">
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
        <div className="container-main relative py-14 md:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full mb-5">
                <div className="w-1.5 h-1.5 bg-gold-400 rounded-full" />
                <span className="text-xs font-medium text-gold-300 tracking-wide uppercase">Popayan, Cauca</span>
              </div>
              <h1 className="font-display text-3xl md:text-[2.75rem] font-extrabold text-white leading-tight tracking-tight mb-4 text-balance">
                Encuentra tu vivienda<br />
                <span className="text-gold-400">cerca del campus</span>
              </h1>
              <p className="text-navy-300 text-base md:text-lg leading-relaxed max-w-lg">
                Compara opciones, revisa el indice de confianza y contacta directamente por WhatsApp.
              </p>
            </div>
            <Casa3D />
          </div>
        </div>
        <div
          ref={luzRef}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300"
          style={{ mixBlendMode: 'overlay' }}
        />
      </section>

      {/* Buscador sticky: z-30 para quedar bajo nav (z-50) y backdrop del menú móvil (z-40) */}
      <section className="bg-white border-b border-neutral-150 sticky top-16 z-30">
        <div className="container-main py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-[1.2]">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Buscar</label>
              <SearchBar value={q} onChange={setQ} />
            </div>
            <div className="flex-1">
              <label htmlFor="cercano-a" className="block text-xs font-medium text-neutral-500 mb-1.5">Cercano a…</label>
              <CercanoA lugares={campus} value={campusId} onChange={setCampusId} inputId="cercano-a" />
            </div>
          </div>
        </div>
      </section>

      {/* Filtros + Resultados */}
      <div className="container-main py-6 md:py-8">
        <Filtros filtros={filtros} setFiltros={setFiltros} />

        <p className="text-xs text-neutral-400 mt-4" aria-live="polite">
          {loading ? 'Cargando...' : `${total} publicaciones · página ${page}/${pages}`}
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm mt-3" role="alert">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 mb-5">
          <div>
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-navy-800">{pubs.length}</span> {pubs.length === 1 ? 'resultado' : 'resultados'}
              {currentCampus && (
                <span className="text-neutral-400">
                  {' '}en {currentCampus.institucion ? `${currentCampus.institucion} - ` : ''}{currentCampus?.nombre_sede}
                </span>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-36 bg-neutral-100 rounded-t-lg" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-neutral-150 rounded w-24 mb-3" />
                  <div className="h-5 bg-neutral-150 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-neutral-150 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-neutral-150 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : pubs.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pubs.map(p => (
                <Link
                  key={p.id}
                  to={{ pathname: `/publicacion/${p.id}`, search: campusId ? `?campus_id=${campusId}` : '' }}
                  className="block"
                >
                  <Card pub={p} lugarNombre={currentCampus ? etiquetaLugar(currentCampus) : null} />
                </Link>
              ))}
            </div>
            <Paginacion page={page} pages={pages} total={total} onPage={setPage} />
          </>
        ) : (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-700 mb-1">Sin resultados{q && <> para “{q}”</>}</p>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {q
                ? <>Intenta con “habitación”, “amoblado” o “cerca a la universidad”, revisa la ortografía o limpia los filtros.</>
                : <>Prueba otro campus o ajusta los filtros de búsqueda.</>}
            </p>
            <button
              type="button"
              onClick={limpiarTodo}
              className="mt-5 text-xs font-semibold text-navy-700 border border-navy-200 rounded-md px-4 py-2 hover:bg-navy-50 transition"
            >
              Limpiar búsqueda y filtros
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
