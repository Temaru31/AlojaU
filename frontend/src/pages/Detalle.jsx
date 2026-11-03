import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Pause } from 'lucide-react'
import { api } from '../services/api'
import Indice from '../components/IndiceConfianza'
import MapaZona from '../components/MapaZona'
import GaleriaFotos from '../components/GaleriaFotos'
import ReportarModal from '../components/ReportarModal'
import { useFavoritos } from '../contexts/FavoritosContext'
import { useComparar } from '../contexts/CompararContext'
import { useAuth } from '../contexts/AuthContext'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import { haceRelativo, estaDesactualizada, fetchConfigPublica, diasDesactualizadaEfectiva } from '../constants'
import { fotosOrdenadas } from '../utils/portada'
import { getEtiquetaTipo } from '../utils/tiposVivienda'

import useTiposVivienda from '../hooks/useTiposVivienda'
import { authHead, bearer } from '../services/authHeaders'
import { ESTADO } from '../utils/estados'
import CabeceraMovilDetalle from './detalle/CabeceraMovilDetalle'
import AccionesAviso from './detalle/AccionesAviso'
import CabeceraDetalle from './detalle/CabeceraDetalle'
import DescripcionAviso from './detalle/DescripcionAviso'
import CaracteristicasAviso from './detalle/CaracteristicasAviso'
import ContactoArrendador from './detalle/ContactoArrendador'
import HistorialInmueble from './detalle/HistorialInmueble'
import SimilaresZona from './detalle/SimilaresZona'
import BarraContactoMovil from './detalle/BarraContactoMovil'


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
  // Con sesión, el dueño/Admin ve su aviso aunque no esté ACTIVO.
  const { token: authToken, user: authUser } = useAuth()
  const [editando, setEditando] = useState(false)
  const [similares, setSimilares] = useState([])
  // Umbral de frescura desde config pública (fallback 30 local).
  // ANTES de los early-returns (hooks siempre en el mismo orden).
  const [diasDesact, setDiasDesact] = useState(() => diasDesactualizadaEfectiva())
  // Nombre dinámico del tipo con fallback estático.
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

  // El toast local no debe aparecer en otra pantalla si se navega
  // antes de los 3.5s (el global de Toaster sí sobrevive, es su trabajo).
  useEffect(() => () => window.clearTimeout(mostrarToast._t), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    // Anti-stale: al cambiar de aviso se limpia el anterior para no mostrar
    // su precio/estado/contacto mientras carga el nuevo (skeleton en vez de
    // datos viejos). Incluye banderas por-aviso (contactado, copiado, etc.).
    setPub(null)
    setYaContactado(false)
    setCopiado('')
    setDescExpandida(false)
    setReportOpen(false)
    setEditando(false)
    const qs = campusIdParam ? `?campus_id=${encodeURIComponent(campusIdParam)}` : ''
    const cfg = authToken ? authHead(authToken) : {}
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

  // Métrica de vistas: 1 POST por aviso (el backend deduplica por IP/día).
  useEffect(() => {
    if (!pub || vistaEnviada.current === pub.id) return
    vistaEnviada.current = pub.id
    try {
      const p = api.post(`/api/publicaciones/${pub.id}/vista`)
      p?.catch?.(() => { /* métrica best-effort */ })
    } catch { /* métrica best-effort */ }
  }, [pub, id])

  // Bloque "similares en la zona" (también alimenta el fallback).
  useEffect(() => {
    if (!pub) { setSimilares([]); return }
    let vivo = true
    api.get(`/api/publicaciones/${pub.id}/similares`, { params: { limit: 4 } })
      .then(r => { if (vivo) setSimilares(Array.isArray(r.data?.items) ? r.data.items : []) })
      .catch(() => { if (vivo) setSimilares([]) })
    return () => { vivo = false }
  }, [pub, id])

  // Historial del inmueble: solo se pide si es el dueño (el backend
  // responde 403 al resto; ni siquiera se intenta sin sesión).
  const [historial, setHistorial] = useState(null)
  useEffect(() => {
    if (!pub || !authToken) { setHistorial(null); return }
    let vivo = true
    api.get(`/api/publicaciones/${pub.id}/historial`, {
      headers: bearer(authToken),
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

  // Lee la config pública una vez (cache 5 min en constants.js).
  useEffect(() => {
    let vivo = true
    fetchConfigPublica(() => api.get('/api/publicaciones/config-publica').then((r) => r.data))
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

  const isActivo = pub.estado === ESTADO.ACTIVO
  // Autoría reactiva (usuario_id lo expone DetailOut).
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
  // Catálogo dinámico primero, estático como fallback (mismo texto).
  const tipoHumano = getEtiquetaTipo(pub.tipo_inmueble, tiposCatalogo)
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

  // Acciones del visitante sobre el aviso, compartidas por la cabecera móvil y la barra de acciones.
  const acciones = {
    esDueno, isFav, isComp, handleToggleFav, handleToggleComp, setEditando, setReportOpen,
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

      {/* Publicidad v1: banner de vigencia del destacado. */}
      {pub.destacado && (
        <div className="mb-4 rounded-lg border border-gold-400 bg-gold-400/10 px-4 py-3" role="status">
          <p className="text-xs sm:text-sm font-semibold text-navy-800">
            Aviso destacado
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            {pub.destacado_vence
              ? `Visible primero en la búsqueda hasta el ${new Date(pub.destacado_vence).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })}.`
              : 'Visible primero en la búsqueda.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-6">
          {!isActivo && pub.estado === ESTADO.PAUSADO_POR_REPORTE && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm" role="alert">
              <p className="font-bold mb-1 flex items-center gap-1.5"><Pause aria-hidden="true" className="w-4 h-4" /> Anuncio pausado temporalmente</p>
              <p className="text-xs leading-relaxed">
                Esta publicación recibió varios reportes de la comunidad y está suspendida mientras nuestro equipo la revisa.
                Por tu seguridad, el contacto está deshabilitado hasta que se resuelva la revisión.
              </p>
            </div>
          )}
          {!isActivo && pub.estado !== ESTADO.PAUSADO_POR_REPORTE && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md p-3 text-sm">
              {/* UX: copia humana, sin enum de BD (ACTIVO/PENDIENTE es interno) */}
              No disponible para contacto por ahora{pub.estado === ESTADO.PENDIENTE ? ' — en revisión' : ''}.
            </div>
          )}

          {/* R7 móvil: título + carrusel táctil + chips deslizables (desktop abajo intacto). */}
          <CabeceraMovilDetalle pub={pub} zona={zona} tipoHumano={tipoHumano} servicios={servicios} mensajeWa={mensajeWa} acciones={acciones} />

          <AccionesAviso pub={pub} acciones={acciones} />

          {compHook.error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">{compHook.error}</p>}
          {toast && (
            <div className="flex items-center justify-between gap-3 text-xs bg-navy-900 text-white rounded-md px-3 py-2" role="status">
              <span>{toast}</span>
              {toast.includes('Favoritos') && <Link to="/favoritos" className="font-semibold text-gold-400 hover:text-gold-500 shrink-0 inline-flex items-center gap-1">Ver <ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>}
              {toast.includes('Comparar') && <Link to="/comparar" className="font-semibold text-gold-400 hover:text-gold-500 shrink-0 inline-flex items-center gap-1">Comparar <ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>}
            </div>
          )}

          {/* R7: en móvil el título/precio viven en el bloque superior + sticky bar. */}
          <CabeceraDetalle pub={pub} canon={canon} deposito={deposito} totalPrimerMes={totalPrimerMes} actualizadoHace={actualizadoHace} desactualizada={desactualizada} />

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
          <DescripcionAviso descripcion={descripcion} descExpandida={descExpandida} setDescExpandida={setDescExpandida} />

          <CaracteristicasAviso pub={pub} zona={zona} tipoHumano={tipoHumano} deposito={deposito} totalPrimerMes={totalPrimerMes} numFotos={numFotos} distMapa={distMapa} etiquetaDist={etiquetaDist} modoTrayectoria={modoTrayectoria} />

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

          <ContactoArrendador pub={pub} wa={wa} hasTel={hasTel} isActivo={isActivo} mensajeWa={mensajeWa} copiado={copiado} yaContactado={yaContactado} isFav={isFav} handleWhatsAppClick={handleWhatsAppClick} handleCopiar={handleCopiar} handleMarcarContactado={handleMarcarContactado} handleToggleFav={handleToggleFav} setReportOpen={setReportOpen} />
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
        <HistorialInmueble historial={historial} />
      )}
      {/* v15.2 similares en la zona (también visibles en avisos inactivos). */}
      {similares.length > 0 && (
        <SimilaresZona similares={similares} />
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

      {/* Sticky móvil: deriva SIEMPRE del `pub` en pantalla (mismo `canon`
          del desglose). Etiqueta inequívoca mensual + nota de depósito. */}
      <BarraContactoMovil canon={canon} deposito={deposito} zona={zona} wa={wa} handleWhatsAppClick={handleWhatsAppClick} />
    </div>
  )
}
