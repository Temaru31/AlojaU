import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isCancelError } from '../services/api'

import { CIUDADES_FALLBACK, etiquetaCiudad } from '../components/CiudadSelector'
import { contarAvanzados } from '../components/Filtros'
import { guardarCampusFiltro, guardarFiltrosBuscar, leerFiltrosBuscar, limpiarFiltrosBuscar } from '../utils/persistenciaBuscar'

import HeroBuscar from './buscar/HeroBuscar'
import FiltrosMovil from './buscar/FiltrosMovil'
import BarraFiltrosEscritorio from './buscar/BarraFiltrosEscritorio'
import ResultadosBusqueda from './buscar/ResultadosBusqueda'
import { obtenerCampus, obtenerCiudades } from '../services/catalogosApi'
import { buscarPublicaciones } from '../services/publicacionesApi'

function parseCiudadId(searchParams) {
  const raw = searchParams.get('ciudad_id')
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

// Snapshot inicial: si se llega a `/` sin params (navbar, volver desde otra
// zona), se restaura la última búsqueda de la sesión en vez de resetear.
// El atrás nativo conserva params por historial; esto cubre el resto.
function snapshotInicialBuscar(sp) {
  const tiene = ['campus_id', 'ciudad_id', 'precio_min', 'precio_max', 'tipo', 'servicios', 'q']
    .some((k) => { const v = sp.get(k); return v != null && v !== '' })
  if (tiene) return null
  try { return leerFiltrosBuscar() } catch { return null }
}

export default function Buscar() {
  const [campus, setCampus] = useState([])
  // Una sola fuente de ciudades para el selector Y la píldora del Hero.
  const [ciudades, setCiudades] = useState(CIUDADES_FALLBACK)
  const [searchParams, setSearchParams] = useSearchParams()
  // Snapshot de la sesión (volver/navegar sin perder la búsqueda). Se lee
  // UNA vez al montar: si la URL ya trae params, manda la URL (null).
  const snapRef = useRef(undefined)
  if (snapRef.current === undefined) snapRef.current = snapshotInicialBuscar(searchParams)
  const snap = snapRef.current
  // El snapshot SOLO rige en el montaje (para sembrar estado/URL). Si se
  // consultara en cada render, borrar un campo (URL sin param) resucitaría
  // el valor viejo del snapshot y el efecto lo re-grabaría (bug: lo
  // "limpiado" reaparecía solo). El restore de abajo lo invalida.
  const snapVigenteRef = useRef(snap != null)
  const snapVigente = snapVigenteRef.current
  // 004 POIs: sin ?campus_id= no hay filtro de cercanía (estado inicial vacío).
  // NaN-safe: un valor manual inválido (?campus_id=abc) equivale a "Todos".
  const campusIdRaw = searchParams.get('campus_id') ?? (snapVigente ? snap?.campus_id : null) ?? null
  const campusIdNum = campusIdRaw != null && campusIdRaw !== '' ? Number(campusIdRaw) : NaN
  const campusId = Number.isInteger(campusIdNum) && campusIdNum >= 1 ? campusIdNum : null
  const ciudadId = parseCiudadId(searchParams) ?? (snapVigente && snap?.ciudad_id != null ? Number(snap.ciudad_id) || null : null)
  // page saneado: ?page=abc o <=0 equivale a 1 (evita 422 y Paginacion rota).
  const pageRaw = Number(searchParams.get('page') || 1)
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  const q = searchParams.get('q') || (snapVigente ? snap?.q : '') || ''
  const [filtros, setFiltros] = useState({
    min: searchParams.get('precio_min') ?? snap?.filtros?.min ?? '',
    max: searchParams.get('precio_max') ?? snap?.filtros?.max ?? '',
    tipo: searchParams.get('tipo') ?? snap?.filtros?.tipo ?? '',
    servicios: searchParams.get('servicios') ?? snap?.filtros?.servicios ?? '',
  })

  // Al montar con snapshot: deja la URL canónica (replace, sin historia).
  // El campus restaurado también se publica como filtro global (Comparar).
  // Tras escribir, el snapshot caduca: la URL manda desde aquí.
  const restauradoRef = useRef(false)
  useEffect(() => {
    if (restauradoRef.current || !snap) return
    restauradoRef.current = true
    snapVigenteRef.current = false
    const params = new URLSearchParams()
    if (snap.campus_id) { params.set('campus_id', snap.campus_id); guardarCampusFiltro(snap.campus_id) }
    if (snap.ciudad_id) params.set('ciudad_id', snap.ciudad_id)
    if (snap.filtros?.min) params.set('precio_min', snap.filtros.min)
    if (snap.filtros?.max) params.set('precio_max', snap.filtros.max)
    if (snap.filtros?.tipo) params.set('tipo', snap.filtros.tipo)
    if (snap.filtros?.servicios) params.set('servicios', snap.filtros.servicios)
    if (snap.q) params.set('q', snap.q)
    params.set('page', 1)
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Snapshot continuo: cada cambio de búsqueda se guarda en la sesión para
  // restaurarlo al volver desde una publicación u otra zona.
  useEffect(() => {
    guardarFiltrosBuscar({
      filtros: { min: filtros.min || '', max: filtros.max || '', tipo: filtros.tipo || '', servicios: filtros.servicios || '' },
      campus_id: campusId != null ? String(campusId) : '',
      ciudad_id: ciudadId != null ? String(ciudadId) : '',
      q: q || '',
    })
  }, [filtros, campusId, ciudadId, q])
  // String primitivo estable (el objeto searchParams cambia de identidad
  // y provocaba doble-fetch). El efecto de resultados depende de este string.
  const queryString = searchParams.toString()

  // Los chips/inputs locales siguen a la URL cuando esta cambia por
  // navegación (atrás/adelante): sin esto, los resultados cambian pero la
  // UI muestra los filtros viejos. No pisa mientras se escribe (firma).
  const firmaFiltros = useRef(null)
  useEffect(() => {
    const desdeUrl = {
      min: searchParams.get('precio_min') || '',
      max: searchParams.get('precio_max') || '',
      tipo: searchParams.get('tipo') || '',
      servicios: searchParams.get('servicios') || '',
    }
    const firma = JSON.stringify(desdeUrl)
    if (firmaFiltros.current === null) {
      firmaFiltros.current = JSON.stringify(filtros)
    }
    if (firma !== firmaFiltros.current) {
      firmaFiltros.current = firma
      setFiltros(desdeUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])
  const [pubs, setPubs] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Panel avanzado controlado desde la barra flotante (una sola fila).
  const [avanzadosAbiertos, setAvanzadosAbiertos] = useState(false)
  const numAvanzados = contarAvanzados(filtros)

  const setCampusId = (id) => {
    // Filtro global: Comparar lo lee desde aquí (vive en otra ruta).
    guardarCampusFiltro(id ?? '')
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
    limpiarFiltrosBuscar()
    guardarCampusFiltro('')
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
    obtenerCampus()
      .then(setCampus)
      .catch(() => setCampus([{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcan' }]))
    // Catálogo de ciudades una sola vez (selector + píldora comparten).
    obtenerCiudades()
      .then((lista) => {
        if (Array.isArray(lista) && lista.length > 0) setCiudades(lista)
      })
      .catch(() => { /* fallback Popayán */ })
  }, [])

  // La píldora lee la ciudad SELECCIONADA en el CiudadSelector
  // (misma lista, mismo value). Sin ciudad elegida -> default Popayán.
  const ciudadSel = ciudades.find((c) => String(c.id) === String(ciudadId)) || ciudades[0] || null
  const ciudadNombre = etiquetaCiudad(ciudadSel)

  // AbortController + error SOLO ante HTTP >= 400 o fallo real de red.
  // Un 200 OK con [] NUNCA pinta banner rojo: va a la tarjeta neutra de vacío.
  // Deps: solo queryString (campusId/ciudadId/page ya viven dentro de él;
  // listarlos además provocaba doble fetch).
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
    buscarPublicaciones(params, { signal: controller.signal })
      .then(data => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const currentCampus = campus.find(c => c.id == campusId)

  // Controles compartidos por la cápsula móvil y la barra de escritorio.
  const busqueda = {
    campus, campusId, setCampusId, ciudades, ciudadId, setCiudadId,
    q, setQ, filtros, setFiltros, numAvanzados, total, limpiarTodo,
  }

  return (
    <div>
      <HeroBuscar ciudadNombre={ciudadNombre} />
      <FiltrosMovil busqueda={busqueda} />
      <BarraFiltrosEscritorio
        busqueda={busqueda}
        avanzadosAbiertos={avanzadosAbiertos}
        setAvanzadosAbiertos={setAvanzadosAbiertos}
      />
      <ResultadosBusqueda
        pubs={pubs} loading={loading} error={error} total={total}
        page={page} pages={pages} setPage={setPage}
        q={q} filtros={filtros} campusId={campusId} currentCampus={currentCampus}
        limpiarTodo={limpiarTodo}
      />
    </div>
  )
}
