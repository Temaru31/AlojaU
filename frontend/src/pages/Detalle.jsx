import { useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Pause } from 'lucide-react'
import Indice from '../components/IndiceConfianza'
import MapaZona from '../components/MapaZona'
import GaleriaFotos from '../components/GaleriaFotos'
import ReportarModal from '../components/ReportarModal'
import { useFavoritos } from '../contexts/FavoritosContext'
import { useComparar } from '../contexts/CompararContext'
import { useAuth } from '../contexts/AuthContext'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import { haceRelativo, estaDesactualizada } from '../constants'
import { fotosOrdenadas } from '../utils/portada'
import { getEtiquetaTipo } from '../utils/tiposVivienda'

import useTiposVivienda from '../hooks/useTiposVivienda'
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
import { DetalleCargando, DetalleNoDisponible } from './detalle/EstadosDetalle'
import { referenciaDeLugar } from './detalle/referenciaLugar'
import {
  useAviso, useDiasDesactualizada, useHistorialAviso, useLugares, useRegistroVista, useSimilares, useToastLocal,
} from './detalle/useDatosDetalle'
import { guardarContacto, leerContactos, registrarVisto } from '../utils/actividadLocal'

export default function Detalle() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  // El mapa se sincroniza al lugar buscado (?campus_id= viene de Buscar).
  const campusIdParam = searchParams.get('campus_id')
  // Con sesión, el dueño/Admin ve su aviso aunque no esté ACTIVO.
  const { token: authToken, user: authUser } = useAuth()
  const { pub, setPub, loading, loadError } = useAviso(id, campusIdParam, authToken)
  const similares = useSimilares(pub)
  const historial = useHistorialAviso(pub, authToken)
  const lugares = useLugares(campusIdParam)
  const diasDesact = useDiasDesactualizada()
  const { toast, mostrarToast } = useToastLocal()
  useRegistroVista(pub)
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const favHook = useFavoritos()
  const compHook = useComparar()

  const [reportOpen, setReportOpen] = useState(false)
  const [descExpandida, setDescExpandida] = useState(false)
  const [yaContactado, setYaContactado] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [editando, setEditando] = useState(false)

  // Al cambiar de aviso, las banderas de la pantalla vuelven a su estado inicial.
  useEffect(() => {
    setYaContactado(false)
    setCopiado('')
    setDescExpandida(false)
    setReportOpen(false)
    setEditando(false)
  }, [id, campusIdParam, authToken])

  // Actividad local (contactados y vistos), sin backend.
  useEffect(() => {
    if (!pub?.id) return
    setYaContactado(leerContactos().some(c => c.id === pub.id))
    registrarVisto(pub)
  }, [pub?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir (o cambiar) un aviso se vuelve al tope (fotos/título), no al
  // scroll heredado del catálogo.
  useEffect(() => {
    try {
      window.scrollTo(0, 0)
    } catch {
      // SSR/tests sin scroll.
    }
  }, [id])

  if (loading) return <DetalleCargando />
  if (!pub) return <DetalleNoDisponible loadError={loadError} />

  const { lugar, distMapa, etiquetaDist } = referenciaDeLugar(pub, lugares, campusIdParam)
  // Trayectoria SOLO con un lugar explícito.
  const modoTrayectoria = lugar != null

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
