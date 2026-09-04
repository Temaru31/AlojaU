import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../services/api'
import Indice from '../components/IndiceConfianza'
import MapaZona from '../components/MapaZona'

export default function Detalle() {
  const { id } = useParams()
  const [pub, setPub] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/publicaciones/${id}`)
      .then(r => setPub(r.data))
      .catch(() => setPub(null))
      .finally(() => setLoading(false))
  }, [id])

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
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-medium text-neutral-700 mb-1">Publicacion no encontrada</p>
          <Link to="/" className="text-sm text-navy-600 hover:text-navy-700 font-medium">Volver a buscar</Link>
        </div>
      </div>
    )
  }

  const hasTel = !!pub.telefono_whatsapp
  const wa = hasTel
    ? `https://wa.me/${pub.telefono_whatsapp}?text=${encodeURIComponent(`Hola, vi ${pub.titulo} (ID ${pub.id}) en AlojaU y me interesa.`)}`
    : null

  const servicios = pub.servicios || []

  return (
    <div className="container-main py-6 md:py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-6">
        <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-neutral-600 truncate">{pub.titulo}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
              {pub.titulo}
            </h1>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-navy-800">
                ${pub.canon_mensual?.toLocaleString() || pub.canon?.toLocaleString()}
              </span>
              <span className="text-sm text-neutral-400">COP/mes</span>
              {pub.deposito_requerido > 0 && (
                <span className="text-xs text-neutral-500 ml-2">
                  + deposito ${pub.deposito_requerido.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Image placeholder */}
          <div className="h-48 md:h-64 bg-gradient-to-br from-navy-50 to-neutral-100 rounded-lg flex items-center justify-center border border-neutral-150">
            <div className="text-center">
              <svg className="w-12 h-12 text-navy-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              <p className="text-xs text-neutral-400">{pub.fotos?.length || pub.num_fotos || 3} fotos</p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            <span className="badge bg-navy-50 text-navy-700 border border-navy-100">
              {pub.tipo_inmueble}
            </span>
            <span className="badge bg-neutral-50 text-neutral-600 border border-neutral-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {pub.zona_nombre || pub.zona || 'Pandiguando'}
            </span>
            {servicios.map((s, i) => (
              <span key={i} className="badge bg-neutral-50 text-neutral-600 border border-neutral-200">
                {s}
              </span>
            ))}
          </div>

          {/* Details */}
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Reglas de convivencia</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{pub.reglas_convivencia || pub.reglas || 'Sin reglas especificadas'}</p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Direccion de referencia</h3>
              <p className="text-sm text-neutral-600">{pub.direccion_referencial}</p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Distancia al campus</p>
                  <p className="text-sm font-semibold text-navy-800">{pub.distancia_geodesica_m || pub.dist_m} m</p>
                </div>
                <div className="w-px h-8 bg-neutral-150" />
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Estado</p>
                  <p className="text-sm font-semibold text-emerald-600">{pub.estado}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div>
            <h3 className="text-sm font-semibold text-navy-800 mb-3">Ubicacion referencial</h3>
            <MapaZona
              zona={pub.zona_nombre || pub.zona}
              dist_m={pub.distancia_geodesica_m || pub.dist_m || 320}
              campus={{ lat: 2.443, lng: -76.606 }}
            />
          </div>

          {/* CTA */}
          <div className="card p-5">
            {hasTel ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-navy-800 mb-0.5">Contactar arrendador</h3>
                  <p className="text-xs text-neutral-500">Respuesta directa por WhatsApp</p>
                </div>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium text-sm rounded-md hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-md">
                <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <p className="text-xs text-orange-700">Sin WhatsApp autorizado — no se muestra boton de contacto</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="lg:sticky lg:top-32">
            <Indice
              indice={pub.indice_confianza || 0}
              desglose={pub.desglose || { completitud: 40, telefono: 20, fotos: 15, vigencia: 15, reportes: 10 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
