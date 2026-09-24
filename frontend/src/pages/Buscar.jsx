import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, isCancelError } from '../services/api'
import Card from '../components/Card'
import Casa3D from '../components/Casa3D'
import CercanoA, { etiquetaLugar } from '../components/CercanoA'
import CiudadSelector, { CIUDADES_FALLBACK, etiquetaCiudad } from '../components/CiudadSelector'
import Filtros, { contarAvanzados } from '../components/Filtros'
import Paginacion from '../components/Paginacion'
import SearchBar from '../components/SearchBar'

function parseCiudadId(searchParams) {
  const raw = searchParams.get('ciudad_id')
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

export default function Buscar() {
  const [campus, setCampus] = useState([])
  // Una sola fuente de ciudades para el selector Y la píldora del Hero.
  const [ciudades, setCiudades] = useState(CIUDADES_FALLBACK)
  const [searchParams, setSearchParams] = useSearchParams()
  // 004 POIs: sin ?campus_id= no hay filtro de cercanía (estado inicial vacío).
  // NaN-safe: un valor manual inválido (?campus_id=abc) equivale a "Todos".
  const campusIdRaw = searchParams.get('campus_id')
  const campusIdNum = campusIdRaw != null ? Number(campusIdRaw) : NaN
  const campusId = Number.isInteger(campusIdNum) && campusIdNum >= 1 ? campusIdNum : null
  const ciudadId = parseCiudadId(searchParams)
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
  // Panel avanzado controlado desde la barra flotante (una sola fila).
  const [avanzadosAbiertos, setAvanzadosAbiertos] = useState(false)
  // Bottom sheet de filtros solo en móvil (<768px).
  const [sheetAbierto, setSheetAbierto] = useState(false)
  const numAvanzados = contarAvanzados(filtros)

  // Cierra el sheet con Escape y bloquea el scroll del fondo mientras abre.
  useEffect(() => {
    if (!sheetAbierto) return
    const onKey = (e) => { if (e.key === 'Escape') setSheetAbierto(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [sheetAbierto])

  const setCampusId = (id) => {
    const params = new URLSearchParams(searchParams)
    if (id == null || id === '') params.delete('campus_id')
    else params.set('campus_id', id)
    params.set('page', 1)
    setSearchParams(params)
  }

  const setCiudadId = (id) => {
    const params = new URLSearchParams(searchParams)
    if (id == null || id === '') params.delete('ciudad_id')
    else params.set('ciudad_id', id)
    params.set('page', 1)
    setSearchParams(params)
  }

  const setQ = (texto) => {
    const params = new URLSearchParams(searchParams)
    if (texto.trim()) params.set('q', texto.trim())
    else params.delete('q')
    params.set('page', 1)
    if (params.toString() !== searchParams.toString()) setSearchParams(params)
  }

  const limpiarTodo = () => {
    setFiltros({ min: '', max: '', tipo: '', servicios: '' })
    const params = new URLSearchParams(searchParams)
    params.delete('q')
    params.delete('precio_min')
    params.delete('precio_max')
    params.delete('tipo')
    params.delete('servicios')
    params.delete('campus_id')
    params.delete('ciudad_id')
    params.set('page', 1)
    setSearchParams(params)
    setAvanzadosAbiertos(false)
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
      if (filtros.min) params.set('precio_min', filtros.min)
      else params.delete('precio_min')
      if (filtros.max) params.set('precio_max', filtros.max)
      else params.delete('precio_max')
      if (filtros.tipo) params.set('tipo', filtros.tipo)
      else params.delete('tipo')
      if (filtros.servicios) params.set('servicios', filtros.servicios)
      else params.delete('servicios')
      params.set('page', 1)
      if (params.toString() !== queryString) {
        setSearchParams(params)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [filtros.min, filtros.max, filtros.tipo, filtros.servicios, queryString, setSearchParams])

  useEffect(() => {
    api.get('/api/campus')
      .then(r => setCampus(r.data))
      .catch(() => setCampus([{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcan' }]))
    // Catálogo de ciudades una sola vez (selector + píldora comparten).
    api.get('/api/ciudades')
      .then((r) => {
        if (Array.isArray(r.data) && r.data.length > 0) setCiudades(r.data)
      })
      .catch(() => { /* fallback Popayán */ })
  }, [])

  // La píldora lee la ciudad SELECCIONADA en el CiudadSelector
  // (misma lista, mismo value). Sin ciudad elegida -> default Popayán.
  const ciudadSel = ciudades.find((c) => String(c.id) === String(ciudadId)) || ciudades[0] || null
  const ciudadNombre = etiquetaCiudad(ciudadSel)

  // Fase 3: AbortController + error SOLO ante HTTP >= 400 o fallo real de red.
  // Un 200 OK con [] NUNCA pinta banner rojo: va a la tarjeta neutra de vacío.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const qq = new URLSearchParams(queryString)
    const params = {
      campus_id: campusId ?? undefined,
      ciudad_id: ciudadId ?? undefined,
      precio_min: qq.get('precio_min') || undefined,
      precio_max: qq.get('precio_max') || undefined,
      tipo: qq.get('tipo') || undefined,
      servicios: qq.get('servicios') || undefined,
      q: qq.get('q') || undefined,
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
        if (isCancelError(err)) return
        if (controller.signal.aborted) return
        const status = err?.response?.status
        // Solo errores HTTP reales (>=400) o fallos de red sin respuesta.
        if (status != null && status < 400) return
        setError('No se pudo cargar publicaciones. Intenta de nuevo.'); setPubs([])
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [campusId, ciudadId, page, queryString])

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
      {/* Hero compacto — max 280px en desktop para no empujar resultados below the fold. */}
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
              <Casa3D compact />
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

      {/* Móvil: cápsula compacta [buscar | filtros] + bottom sheet. */}
      <div className="md:hidden sticky top-16 z-30">
        <div className="container-main pt-2">
          <div className="flex items-center gap-2 rounded-full bg-white border border-neutral-150 shadow-md pl-1 pr-1 py-1">
            <div className="flex-1 min-w-0">
              <SearchBar value={q} onChange={setQ} placeholder="Buscar zona…" />
            </div>
            <button
              type="button"
              onClick={() => setSheetAbierto(true)}
              aria-label={`Abrir filtros${numAvanzados > 0 ? `, ${numAvanzados} activos` : ''}`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-navy-800 text-white text-xs font-bold px-3.5 py-2.5"
            >
              <span aria-hidden="true">⚙️</span> Filtros
              {numAvanzados > 0 && (
                <span className="inline-flex items-center rounded-full bg-gold-400 px-1.5 py-px text-[10px] font-bold text-navy-900" aria-hidden="true">
                  {numAvanzados}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {sheetAbierto && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filtros de búsqueda">
          <div aria-hidden="true" onClick={() => setSheetAbierto(false)} className="absolute inset-0 bg-navy-950/60" />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-3xl bg-white shadow-2xl">
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-neutral-100">
              <p className="text-sm font-bold text-navy-900">
                Filtros
                {numAvanzados > 0 && <span className="ml-2 text-[11px] font-bold text-navy-700 bg-navy-50 rounded-full px-2 py-0.5">{numAvanzados} activos</span>}
              </p>
              <button
                type="button"
                onClick={() => setSheetAbierto(false)}
                aria-label="Cerrar filtros"
                className="w-8 h-8 rounded-full text-neutral-500 hover:bg-neutral-100 flex items-center justify-center text-lg"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5" htmlFor="cercano-a-m">Cercano a…</label>
                <CercanoA lugares={campus} value={campusId} onChange={setCampusId} inputId="cercano-a-m" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5" htmlFor="ciudad-m">Ciudad</label>
                <CiudadSelector value={ciudadId} onChange={setCiudadId} inputId="ciudad-m" ciudades={ciudades} />
              </div>
              <Filtros filtros={filtros} setFiltros={setFiltros} soloPanel />
            </div>
            <div className="p-4 border-t border-neutral-100 bg-white">
              <button
                type="button"
                onClick={() => setSheetAbierto(false)}
                className="btn-accent w-full justify-center !py-3"
              >
                Ver {total} resultado{total === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra flotante desktop (una sola fila, solapa el Hero, sin recarga). */}
      <div className="hidden md:block sticky top-16 z-30">
        <div className="container-main">
          <div className="relative -mt-7 rounded-2xl bg-white border border-neutral-150 shadow-lg p-3">
            <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
              <div className="flex-[1.6] min-w-0">
                {/* SearchBar ya expone aria-label="Buscar publicaciones por texto". */}
                <SearchBar value={q} onChange={setQ} />
              </div>
              <div className="flex-1 min-w-0 lg:max-w-60">
                <label className="sr-only" htmlFor="cercano-a">Cercano a</label>
                <CercanoA lugares={campus} value={campusId} onChange={setCampusId} inputId="cercano-a" />
              </div>
              <div className="flex-1 min-w-0 lg:max-w-52">
                <label className="sr-only" htmlFor="ciudad">Ciudad</label>
                <CiudadSelector value={ciudadId} onChange={setCiudadId} inputId="ciudad" ciudades={ciudades} />
              </div>
              <button
                type="button"
                onClick={() => setAvanzadosAbiertos((v) => !v)}
                aria-expanded={avanzadosAbiertos}
                aria-controls="panel-avanzados"
                className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition bg-navy-800 text-white border-navy-800 hover:bg-navy-900"
              >
                <span aria-hidden="true">🎛️</span> Filtros
                {numAvanzados > 0 && (
                  <span className="inline-flex items-center rounded-full bg-gold-400 px-2 py-0.5 text-[11px] font-bold text-navy-900" aria-label={`${numAvanzados} filtros activos`}>
                    {numAvanzados}
                  </span>
                )}
                <span aria-hidden="true" className={`text-[10px] transition-transform ${avanzadosAbiertos ? 'rotate-180' : ''}`}>▼</span>
              </button>
            </div>
            {avanzadosAbiertos && (
              <div id="panel-avanzados" className="mt-3 border-t border-neutral-100 pt-3">
                <Filtros filtros={filtros} setFiltros={setFiltros} soloPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="container-main py-6 md:py-8">

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[420px]" role="status" aria-label="Cargando publicaciones" aria-busy="true">
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
            <p className="text-sm font-medium text-neutral-700 mb-1">No encontramos alojamientos que coincidan con tu búsqueda{q && <> para “{q}”</>}</p>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {q
                ? <>Intenta con “habitación”, “amoblado” o “cerca a la universidad”, revisa la ortografía o limpia los filtros.</>
                : <>Prueba otro lugar cercano o ajusta los filtros de búsqueda.</>}
            </p>
            <button
              type="button"
              onClick={limpiarTodo}
              className="mt-5 text-xs font-semibold text-navy-700 border border-navy-200 rounded-md px-4 py-2 hover:bg-navy-50 transition"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
