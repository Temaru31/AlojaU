import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import Indice from '../components/IndiceConfianza'
import MapaZona from '../components/MapaZona'
import GaleriaFotos from '../components/GaleriaFotos'
import BotonCompartir from '../components/BotonCompartir'
import CarruselFotos from '../components/CarruselFotos'
import ReportarModal from '../components/ReportarModal'
import { formatDistancia, formatTiempoCaminando } from '../utils/formatters'
import { useFavoritos } from '../contexts/FavoritosContext'
import { useComparar } from '../contexts/CompararContext'
import { useAuth } from '../contexts/AuthContext'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import { haceRelativo, estaDesactualizada, fetchConfigPublica, diasDesactualizadaEfectiva } from '../constants'
import { fotosOrdenadas } from '../utils/portada'
import { getEtiquetaTipo } from '../utils/tiposVivienda'
import { formatearSesionFecha } from '../utils/sesion'
import { etiquetaEvento } from '../utils/historial'
import { api as _apiDetalle } from '../services/api'
import useTiposVivienda from '../hooks/useTiposVivienda'

export function humanizarTipo(tipo, tipos = null) {
  // Compat: antes mapa local; ahora delega a la fuente única (Bloque 3).
  // Sin `tipos` equivale al mapa histórico (tests intactos).
  return getEtiquetaTipo(tipo, tipos)
}

function leerContactos() {
  try {
    const raw = localStorage.getItem('alojau_contactos')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function guardarContacto(id, titulo) {
  try {
    const prev = leerContactos()
    if (prev.some(c => c.id === id)) return prev
    const next = [...prev, { id, titulo: titulo || '', fecha: new Date().toISOString() }]
    localStorage.setItem('alojau_contactos', JSON.stringify(next.slice(-100)))
    return next
  } catch {
    return []
  }
}

export default function Detalle() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  // 004 POIs: el mapa se sincroniza al lugar buscado (?campus_id= viene de Buscar).
  const campusIdParam = searchParams.get('campus_id')
  const [lugares, setLugares] = useState([])
  const [pub, setPub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [descExpandida, setDescExpandida] = useState(false)
  const [toast, setToast] = useState('')
  const [yaContactado, setYaContactado] = useState(false)
  const [copiado, setCopiado] = useState('')
  const favHook = useFavoritos()
  // v14.1: con sesión, el dueño/Admin ve su aviso aunque no esté ACTIVO.
  const { token: authToken, user: authUser } = useAuth()
  const [editando, setEditando] = useState(false)
  const [similares, setSimilares] = useState([])
  // Detalle #3: umbral de frescura desde config pública (fallback 30 local).
  // ANTES de los early-returns (hooks siempre en el mismo orden).
  const [diasDesact, setDiasDesact] = useState(() => diasDesactualizadaEfectiva())
  // M2: nombre dinámico del tipo con fallback estático.
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const vistaEnviada = useRef(null)
  const compHook = useComparar()

  const mostrarToast = (msg) => {
    setToast(msg)
    try {
      window.dispatchEvent(new CustomEvent('alojau:toast', { detail: { message: msg } }))
    } catch { /* sin-toaster: toast local basta */ }
    window.clearTimeout(mostrarToast._t)
    mostrarToast._t = window.setTimeout(() => setToast(''), 3500)
  }

  // Bloque 3: el toast local no debe aparecer en otra pantalla si se navega
  // antes de los 3.5s (el global de Toaster sí sobrevive, es su trabajo).
  useEffect(() => () => window.clearTimeout(mostrarToast._t), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    const qs = campusIdParam ? `?campus_id=${encodeURIComponent(campusIdParam)}` : ''
    const cfg = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}
    api.get(`/api/publicaciones/${id}${qs}`, cfg)
      .then(r => { if (!cancelled) setPub(r.data) })
      .catch((err) => {
        if (cancelled) return
        setPub(null)
        const status = err?.response?.status
        if (status === 404) setLoadError('not-found')
        else setLoadError('network')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    // UX/perf: cambio rápido de aviso no pisa el detalle con respuesta tardía.
    return () => { cancelled = true }
  }, [id, campusIdParam, authToken])

  // v15.2 métrica de vistas: 1 POST por aviso (el backend deduplica por IP/día).
  useEffect(() => {
    if (!pub || vistaEnviada.current === pub.id) return
    vistaEnviada.current = pub.id
    try {
      const p = api.post(`/api/publicaciones/${pub.id}/vista`)
      p?.catch?.(() => { /* métrica best-effort */ })
    } catch { /* métrica best-effort */ }
  }, [pub, id])

  // v15.2 bloque "similares en la zona" (también alimenta el fallback).
  useEffect(() => {
    if (!pub) { setSimilares([]); return }
    let vivo = true
    api.get(`/api/publicaciones/${pub.id}/similares`, { params: { limit: 4 } })
      .then(r => { if (vivo) setSimilares(Array.isArray(r.data?.items) ? r.data.items : []) })
      .catch(() => { if (vivo) setSimilares([]) })
    return () => { vivo = false }
  }, [pub, id])

  // M4 historial del inmueble: solo se pide si es el dueño (el backend
  // responde 403 al resto; ni siquiera se intenta sin sesión).
  const [historial, setHistorial] = useState(null)
  useEffect(() => {
    if (!pub || !authToken) { setHistorial(null); return }
    let vivo = true
    api.get(`/api/publicaciones/${pub.id}/historial`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => { if (vivo) setHistorial(Array.isArray(r.data?.items) ? r.data.items : []) })
      .catch(() => { if (vivo) setHistorial(null) })
    return () => { vivo = false }
  }, [pub, authToken])

  // Catálogo de lugares para resolver ?campus_id= aunque el backend no traiga campus_ref.
  useEffect(() => {
    if (!campusIdParam) return
    let cancelled = false
    api.get('/api/campus')
      .then(r => { if (!cancelled && Array.isArray(r.data)) setLugares(r.data) })
      .catch(() => { /* sin catálogo: se usa campus_ref o fallback legacy */ })
    return () => { cancelled = true }
  }, [campusIdParam])

  // P-04: tracking local de contacto + historial de vistos (retención, sin backend).
  useEffect(() => {
    if (!pub?.id) return
    setYaContactado(leerContactos().some(c => c.id === pub.id))
    try {
      const raw = localStorage.getItem('alojau_historial')
      const hist = JSON.parse(raw || '[]')
      const lista = Array.isArray(hist) ? hist.filter(h => h.id !== pub.id) : []
      lista.unshift({ id: pub.id, titulo: pub.titulo || '', fecha: new Date().toISOString() })
      localStorage.setItem('alojau_historial', JSON.stringify(lista.slice(0, 30)))
    } catch { /* historial opcional */ }
  }, [pub?.id])

  // UX: al abrir (o cambiar) una publicación, volver al tope (fotos/título),
  // no quedarse abajo en el mapa por el scroll heredado del catálogo.
  useEffect(() => {
    try {
      window.scrollTo(0, 0)
    } catch {
      // SSR/tests sin scroll: no rompe render
    }
  }, [id])

  // Detalle #3: lee la config pública una vez (cache 5 min en constants.js).
  useEffect(() => {
    let vivo = true
    fetchConfigPublica(() => _apiDetalle.get('/api/publicaciones/config-publica').then((r) => r.data))
      .then((cfg) => { if (vivo && cfg?.dias_desactualizada) setDiasDesact(Number(cfg.dias_desactualizada)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  if (loading) {
    return (
      <div className="container-main py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-neutral-150 rounded w-1/2" />
          <div className="h-5 bg-neutral-150 rounded w-1/3" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="h-64 bg-neutral-150 rounded-lg" />
            </div>
            <div className="h-48 bg-neutral-150 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!pub) {
    const es404 = loadError === 'not-found'
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-medium text-neutral-700 mb-1">
            {es404 ? 'Esta publicación no se encuentra disponible actualmente'
              : loadError === '' ? 'Publicación no encontrada'
              : 'No se pudo cargar la publicación'}
          </p>
          {es404 && (
            <p className="text-xs text-neutral-500 mb-4">
              Pudo ser pausada, vendida o eliminada. Explora inmuebles similares en Buscar.
            </p>
          )}
          {loadError === 'network' && (
            <p className="text-xs text-neutral-500 mb-4">Revisa tu conexión o intenta de nuevo. Si persiste, el servidor puede estar iniciando.</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-2">
            {loadError === 'network' && (
              <button type="button" onClick={() => window.location.reload()} className="btn-secondary text-sm">
                Reintentar
              </button>
            )}
            <Link to="/" className="text-sm text-navy-600 hover:text-navy-700 font-medium">Volver a buscar</Link>
          </div>
        </div>
      </div>
    )
  }

  // 004 POIs: referencia dinámica al lugar buscado (reemplaza el campus hardcodeado).
  // Prioridad: campus_ref del backend > catálogo /api/campus > fallback legacy Tulcán.
  const refApi = pub.campus_ref || null
  const distBase = pub.distancia_geodesica_m ?? pub.dist_m
  const lugarLista = !refApi && campusIdParam
    ? lugares.find(c => String(c.id) === String(campusIdParam))
    : null
  const nombreLugarLista = lugarLista
    ? `${lugarLista.institucion || ''}${lugarLista.nombre_sede && lugarLista.nombre_sede !== 'Sede Única' ? ` - ${lugarLista.nombre_sede}` : ''}`.trim() || 'Lugar de referencia'
    : null
  const lugar = refApi
    ? { lat: refApi.latitud, lng: refApi.longitud, nombre: `${refApi.institucion} - ${refApi.nombre_sede}` }
    : (lugarLista
      ? { lat: lugarLista.latitud ?? lugarLista.lat, lng: lugarLista.longitud ?? lugarLista.lng, nombre: nombreLugarLista }
      : null)
  // Trayectoria SOLO con lugar explícito (?campus_id= del flujo
  // de búsqueda). Sin filtro previo -> modo inmueble único (1 pin, sin
  // distancias hacia un campus no seleccionado).
  const modoTrayectoria = lugar != null
  // Si se pidió una referencia y su distancia es desconocida (sin backfill,
  // otra ciudad, sin coords), se muestra "No informado": nunca se hereda la
  // distancia mínima a OTRO lugar bajo la etiqueta del lugar pedido.
  const distMapa = refApi ? refApi.dist_m : (lugarLista ? null : distBase)
  const etiquetaDist = refApi
    ? `Distancia a ${refApi.nombre_sede}`
    : (lugarLista ? `Distancia a ${nombreLugarLista}` : 'Distancia al campus')

  const isActivo = pub.estado === 'ACTIVO'
  // v15.2 autoría reactiva (usuario_id lo expone DetailOut).
  const esDueno = !!(authUser?.id != null && pub.usuario_id != null
    && Number(authUser.id) === Number(pub.usuario_id))
  const actualizadoHace = haceRelativo(pub.updated_at || pub.fecha_renovacion)
  const desactualizada = estaDesactualizada(pub.updated_at || pub.fecha_renovacion, diasDesact)
  const hasTel = !!pub.telefono_whatsapp && isActivo
  const wa = hasTel
    ? `https://wa.me/${pub.telefono_whatsapp}?text=${encodeURIComponent(`Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`)}`
    : null

  const canon = pub.canon_mensual ?? pub.canon
  const depositoRaw = pub.deposito_requerido ?? pub.deposito
  const deposito = depositoRaw == null || depositoRaw === '' ? null : Number(depositoRaw)
  const totalPrimerMes = canon != null && deposito != null ? Number(canon) + Number(deposito) : null
  // Fallbacks unificados a "No informado"; num_fotos real.
  const zona = pub.zona_nombre || pub.zona || 'No informado'
  const servicios = pub.servicios || []
  const descripcion = (pub.descripcion || '').trim()
  // M2: catálogo dinámico primero, estático como fallback (mismo texto).
  const tipoHumano = humanizarTipo(pub.tipo_inmueble, tiposCatalogo)
  const numFotos = Array.isArray(pub.fotos) ? pub.fotos.length : (pub.num_fotos ?? 0)
  const isFav = favHook.isFav(pub.id)
  const isComp = compHook.isSelected(pub.id)
  const mensajeWa = `Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`

  const handleToggleFav = () => {
    const estaba = favHook.isFav(pub.id)
    favHook.toggle(pub.id)
    mostrarToast(estaba ? 'Quitado de favoritos' : 'Guardado en favoritos · ver en Favoritos')
  }

  const handleToggleComp = () => {
    const estaba = compHook.isSelected(pub.id)
    compHook.toggle(pub.id)
    if (!estaba && compHook.comparar?.length >= 2) mostrarToast('Añadido a comparar · abre Comparar para decidir')
  }

  const handleWhatsAppClick = () => {
    guardarContacto(pub.id, pub.titulo)
    setYaContactado(true)
  }

  const handleCopiar = async (texto, etiqueta) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(etiqueta)
      window.setTimeout(() => setCopiado(''), 2000)
    } catch {
      setCopiado('')
    }
  }

  const handleMarcarContactado = () => {
    guardarContacto(pub.id, pub.titulo)
    setYaContactado(true)
    mostrarToast('Marcado como contactado · lo verás en tu historial')
  }

  return (
    <div className="container-main py-6 md:py-8 pb-24 sm:pb-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-6">
        <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-neutral-600 truncate">{pub.titulo}</span>
      </nav>
      {/* v15.2 banner de estado no disponible (solo lo ven dueño/Admin). */}
      {!isActivo && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" role="status">
          <p className="text-xs sm:text-sm font-semibold text-amber-800">
            Esta publicación se encuentra temporalmente pausada o desactualizada por el arrendador.
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Estás viendo una vista previa de lectura{esDueno ? ' de tu propio aviso' : ''}; sin botones de contacto ni reserva.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-6">
          {!isActivo && pub.estado === 'PAUSADO_POR_REPORTE' && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm" role="alert">
              <p className="font-bold mb-1">⏸️ Anuncio pausado temporalmente</p>
              <p className="text-xs leading-relaxed">
                Esta publicación recibió varios reportes de la comunidad y está suspendida mientras nuestro equipo la revisa.
                Por tu seguridad, el contacto está deshabilitado hasta que se resuelva la revisión.
              </p>
            </div>
          )}
          {!isActivo && pub.estado !== 'PAUSADO_POR_REPORTE' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md p-3 text-sm">
              {/* UX: copia humana, sin enum de BD (ACTIVO/PENDIENTE es interno) */}
              No disponible para contacto por ahora{pub.estado === 'PENDIENTE' ? ' — en revisión' : ''}.
            </div>
          )}

          {/* R7 móvil: título + carrusel táctil + chips deslizables (desktop abajo intacto). */}
          <div className="sm:hidden space-y-3 mb-4">
            <div>
              <h1 className="font-display text-xl font-bold text-navy-900 tracking-tight leading-snug">
                {pub.titulo}
              </h1>
              <p className="text-xs text-neutral-600 mt-1 truncate">{zona} · {tipoHumano}</p>
            </div>
            <CarruselFotos
              fotos={fotosOrdenadas(pub)}
              titulo={pub.titulo}
              acciones={
                <>
                  <button
                    type="button"
                    onClick={handleToggleFav}
                    aria-pressed={isFav}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                    className={`w-11 h-11 rounded-full text-lg flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition ${isFav ? 'bg-red-500 text-white' : 'bg-black/60 text-white'}`}
                  >
                    <span aria-hidden="true">{isFav ? '♥' : '♡'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleComp}
                    aria-pressed={isComp}
                    aria-label={isComp ? 'Quitar de comparar' : 'Agregar a comparar'}
                    className={`w-11 h-11 rounded-full text-lg font-bold flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition ${isComp ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white'}`}
                  >
                    <span aria-hidden="true">{isComp ? '✓' : '+'}</span>
                  </button>
                </>
              }
            />
            {/* focus-within quita la máscara para no recortar el anillo de foco en bordes. */}
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap no-scrollbar fade-x focus-within:[mask-image:none] focus-within:[-webkit-mask-image:none] pb-1" role="list" aria-label="Características">
              {[tipoHumano, zona, ...servicios].map((c, i) => (
                <span key={`${c}-${i}`} role="listitem" className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button"
              onClick={handleToggleFav}
              aria-pressed={isFav}
              className={`hidden sm:inline-block px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 ${isFav ? 'bg-red-500 text-white border-red-500' : 'bg-white border-neutral-200 hover:bg-neutral-50'}`}
            >
              {isFav ? '♥ En favoritos' : '♡ Añadir a favoritos'}
            </button>
            <button type="button"
              onClick={handleToggleComp}
              aria-pressed={isComp}
              className={`hidden sm:inline-block px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 ${isComp ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-neutral-200 hover:bg-neutral-50'}`}
            >
              {isComp ? '✓ En comparar' : '+ Comparar (máx 3)'}
            </button>
            <span className="hidden sm:inline-block">
              <BotonCompartir
                titulo={`${pub.titulo} en AlojaU`}
                url={typeof window !== 'undefined' ? window.location.href : `/publicacion/${pub.id}`}
                etiqueta="Compartir aviso"
              />
            </span>
            {/* UX: reportar visible en cabecera (secundario discreto, no escondido bajo el mapa) */}
            <button type="button"
              onClick={() => setReportOpen(true)}
              aria-label="Reportar este aviso"
              className="px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition bg-white border-neutral-200 text-neutral-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
            >
              ⚑ Reportar aviso
            </button>
            {/* v15.2 acceso directo del dueño (verificado por usuario_id). */}
            {esDueno && (
              <button type="button"
                onClick={() => setEditando(true)}
                aria-label={`Editar ${pub.titulo}`}
                className="px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition bg-navy-800 border-navy-800 text-white hover:bg-navy-900"
              >
                ✎ Editar publicación
              </button>
            )}
          </div>

          {compHook.error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">{compHook.error}</p>}
          {toast && (
            <div className="flex items-center justify-between gap-3 text-xs bg-navy-900 text-white rounded-md px-3 py-2" role="status">
              <span>{toast}</span>
              {toast.includes('Favoritos') && <Link to="/favoritos" className="font-semibold text-gold-400 hover:text-gold-500 shrink-0">Ver →</Link>}
              {toast.includes('Comparar') && <Link to="/comparar" className="font-semibold text-gold-400 hover:text-gold-500 shrink-0">Comparar →</Link>}
            </div>
          )}

          {/* R7: en móvil el título/precio viven en el bloque superior + sticky bar. */}
          <div className="hidden sm:block">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
              {pub.titulo}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 mb-2">
              {actualizadoHace && <span>Actualizado {actualizadoHace}</span>}
              {typeof pub.vistas === 'number' && (
                <span aria-label={`${pub.vistas} vistas`}>· 👁 {pub.vistas} {pub.vistas === 1 ? 'vista' : 'vistas'}</span>
              )}
              {desactualizada && (
                <span className="font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-300">
                  Desactualizada
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xl font-bold text-navy-800">
                {canon != null ? `$${Number(canon).toLocaleString('es-CO')}` : 'No informado'}
              </span>
              <span className="text-sm text-neutral-400">COP/mes</span>
              {deposito == null ? (
                <span className="text-xs text-neutral-400 ml-2">· Depósito no informado</span>
              ) : deposito > 0 ? (
                <span className="text-xs text-neutral-500 ml-2">
                  + depósito ${Number(deposito).toLocaleString('es-CO')}
                </span>
              ) : (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-2">
                  Sin depósito
                </span>
              )}
            </div>
            {totalPrimerMes != null && (
              <p className="text-xs text-neutral-500 mt-1">
                Total primer mes: <span className="font-semibold text-navy-800">${Number(totalPrimerMes).toLocaleString('es-CO')} COP</span>
                <span className="text-neutral-400"> (canon + depósito)</span>
              </p>
            )}
          </div>

          <div className="hidden sm:flex flex-wrap gap-2">
            <span className="badge bg-navy-50 text-navy-700 border border-navy-100">
              {tipoHumano}
            </span>
            <span className="badge bg-neutral-50 text-neutral-600 border border-neutral-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {zona}
            </span>
            {servicios.map((s, i) => (
              <span key={i} className="badge bg-neutral-50 text-neutral-600 border border-neutral-200">
                {s}
              </span>
            ))}
          </div>

          {/* BUG#1: galería en orden de portada (imagenes por orden si existen). */}
          <div className="hidden sm:block">
            <GaleriaFotos fotos={fotosOrdenadas(pub)} titulo={pub.titulo} />
          </div>

          {/* P-01: la descripción existía en BD/API pero nunca se renderizaba. */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Descripción</h3>
            {descripcion ? (
              <div>
                <p className={`text-sm text-neutral-600 leading-relaxed whitespace-pre-line ${descExpandida ? '' : 'line-clamp-2'}`}>
                  {descripcion}
                </p>
                {descripcion.length > 180 && (
                  <button
                    type="button"
                    onClick={() => setDescExpandida(v => !v)}
                    className="mt-2 text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
                    aria-expanded={descExpandida}
                  >
                    {descExpandida ? 'Leer menos' : 'Leer más'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">El arrendador aún no agregó una descripción.</p>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Contrato y estadía</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
                  <dt className="text-[11px] text-neutral-400 mb-0.5">Tipo</dt>
                  <dd className="font-medium text-navy-800">{tipoHumano}</dd>
                </div>
                <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
                  <dt className="text-[11px] text-neutral-400 mb-0.5">Depósito</dt>
                  <dd className="font-medium text-navy-800">
                    {deposito == null ? 'No informado' : deposito === 0 ? 'Sin depósito' : `$${Number(deposito).toLocaleString('es-CO')}`}
                  </dd>
                </div>
                <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
                  <dt className="text-[11px] text-neutral-400 mb-0.5">Total entrada</dt>
                  <dd className="font-medium text-navy-800">
                    {totalPrimerMes != null ? `$${Number(totalPrimerMes).toLocaleString('es-CO')}` : 'No informado'}
                  </dd>
                </div>
              </dl>
              <p className="text-[11px] text-neutral-400 mt-2">
                Confirma reembolsabilidad del depósito, duración mínima y servicios incluidos por WhatsApp antes de separar.
              </p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Reglas de convivencia</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{pub.reglas_convivencia || pub.reglas || 'No informado'}</p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Dirección de referencia</h3>
              <p className="text-sm text-neutral-600">{pub.direccion_referencial || 'No informado'}</p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              {/* UX: sin columna "Estado" (ACTIVO/PENDIENTE es interno de BD, no del estudiante) */}
              <div className="flex items-center gap-4">
                <div>
                  {modoTrayectoria ? (
                    <>
                      <p className="text-xs text-neutral-400 mb-0.5">{etiquetaDist}</p>
                      <p className="text-sm font-semibold text-navy-800">{distMapa != null ? formatDistancia(distMapa) : 'No informado'}{distMapa != null && formatTiempoCaminando(distMapa) ? ` · ${formatTiempoCaminando(distMapa)}` : ''}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-neutral-400 mb-0.5">Ubicación de la vivienda</p>
                      <p className="text-sm font-semibold text-navy-800">{zona}</p>
                    </>
                  )}
                </div>
                <div className="w-px h-8 bg-neutral-150" />
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Fotos</p>
                  <p className="text-sm font-semibold text-navy-800">{numFotos}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-navy-800 mb-3">Ubicación referencial</h3>
            <MapaZona
              zona={zona}
              dist_m={modoTrayectoria ? distMapa : null}
              campus={modoTrayectoria ? { lat: 2.443, lng: -76.606 } : null}
              lugar={lugar}
              aviso={pub.latitud != null && pub.longitud != null ? { lat: pub.latitud, lng: pub.longitud } : null}
              direccion={pub.direccion_referencial || ''}
              titulo={pub.titulo}
              onGeoError={mostrarToast}
            />
          </div>

          <div className="card p-5 sm:p-6">
            {hasTel ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-navy-900 mb-0.5">Contactar arrendador</h3>
                  <p className="text-xs text-neutral-500">Respuesta directa por WhatsApp</p>
                  {yaContactado && (
                    <p className="text-xs font-medium text-emerald-700 mt-1.5 inline-flex items-center gap-1">
                      <span aria-hidden="true">✓</span> Ya contactaste este aviso
                    </p>
                  )}
                </div>
                {/* Acción primaria: CTA dominante, ancho completo en móvil */}
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWhatsAppClick}
                  className="flex w-full items-center justify-center gap-2.5 px-6 py-3.5 min-h-[52px] bg-emerald-700 text-white font-semibold text-base rounded-xl shadow-sm hover:bg-emerald-800 hover:shadow active:bg-emerald-800 active:scale-[0.99] transition"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Contactar por WhatsApp
                </a>
                {/* Acciones secundarias: ghost, agrupadas, sin competir con el CTA */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => handleCopiar(pub.telefono_whatsapp, 'numero')}
                    className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
                  >
                    {copiado === 'numero' ? '✓ Número copiado' : 'Copiar número'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopiar(mensajeWa, 'mensaje')}
                    className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
                  >
                    {copiado === 'mensaje' ? '✓ Mensaje copiado' : 'Copiar mensaje'}
                  </button>
                  {!yaContactado && (
                    <button
                      type="button"
                      onClick={handleMarcarContactado}
                      className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
                    >
                      Ya contacté por otro medio
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                  <p className="text-xs text-orange-700">
                    {/* UX: sin enum de BD; el estudiante solo necesita saber que no hay contacto */}
                    {!isActivo
                      ? 'Este aviso no está disponible por ahora'
                      : 'Sin WhatsApp autorizado — no se muestra botón de contacto'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                  <button
                    type="button"
                    onClick={handleToggleFav}
                    className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
                  >
                    {isFav ? '♥ Guardado en favoritos' : '♡ Guardar y avísame si habilita contacto'}
                  </button>
                  {!yaContactado && (
                    <button
                      type="button"
                      onClick={handleMarcarContactado}
                      className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
                    >
                      Ya contacté por otro medio
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* UX: segunda vía clara para reportar, junto al contacto (texto oscuro legible) */}
            <button type="button"
              onClick={() => setReportOpen(true)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-md py-2 transition-colors"
            >
              <span aria-hidden="true">🚩</span> ¿Hay algún problema con este anuncio?
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="lg:sticky lg:top-32">
            <Indice
              indice={pub.indice_confianza || 0}
              desglose={pub.desglose || { completitud: 40, telefono: 20, fotos: 15, vigencia: 15, reportes: 10 }}
            />
          </div>
        </div>
      </div>
      {reportOpen && (
        <ReportarModal publicacionId={pub.id} titulo={pub.titulo} onClose={() => setReportOpen(false)} />
      )}
      {/* M4 historial del inmueble: solo el dueño ve su trazabilidad. */}
      {esDueno && historial && historial.length > 0 && (
        <section aria-label="Historial del inmueble" className="mt-10">
          <h2 className="font-display text-lg font-bold text-navy-900 mb-3">
            Historial del inmueble
          </h2>
          <ul className="card divide-y divide-neutral-100">
            {historial.map(h => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="font-semibold text-navy-800 shrink-0 min-w-24">
                  {etiquetaEvento(h.evento)}
                </span>
                <span className="text-neutral-400 ml-auto shrink-0">
                  {formatearSesionFecha(h.creado_en) || 'fecha desconocida'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* v15.2 similares en la zona (también visibles en avisos inactivos). */}
      {similares.length > 0 && (
        <section aria-label="Inmuebles similares disponibles en esta zona" className="mt-10">
          <h2 className="font-display text-lg font-bold text-navy-900 mb-3">
            Inmuebles similares disponibles en esta zona
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similares.map(s => (
              <Link key={s.id} to={`/publicacion/${s.id}`}
                className="card p-3 hover:border-navy-300 transition block">
                <p className="text-sm font-semibold text-navy-900 line-clamp-1">{s.titulo}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {s.canon_mensual != null ? `$${Number(s.canon_mensual).toLocaleString('es-CO')} COP/mes` : 'Canon no informado'}
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{s.zona_nombre || s.zona || ''}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
      {/* v15.2 el dueño edita sin salir del detalle (reutiliza el modal). */}
      {editando && authToken && (
        <EditarPublicacionModal
          pub={pub}
          token={authToken}
          onClose={() => setEditando(false)}
          onSaved={(upd) => { setPub(prev => ({ ...prev, ...upd })); setEditando(false) }}
        />
      )}

      {/* R7 sticky bottom bar móvil: precio + contacto (el contenedor lleva pb-24 para no tapar nada). */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-neutral-150 bg-white/95 backdrop-blur px-4 py-3" role="region" aria-label="Contacto rápido">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-navy-900 leading-tight truncate">
              {canon != null ? `$${Number(canon).toLocaleString('es-CO')}` : 'No informado'}
              <span className="text-[11px] font-normal text-neutral-400"> COP/mes</span>
            </p>
            <p className="text-xs text-neutral-600 truncate">{zona}</p>
          </div>
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppClick}
              aria-label="Abrir chat de WhatsApp"
              className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-bold shadow-lg active:bg-emerald-800 transition"
            >
              <span aria-hidden="true">💬</span> WhatsApp
            </a>
          ) : (
            <span className="shrink-0 inline-flex items-center px-4 py-3 min-h-[48px] rounded-xl bg-neutral-100 text-neutral-600 border border-neutral-200 text-xs font-semibold">
              Sin contacto
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
