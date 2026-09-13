import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { formatDistancia, formatTiempoCaminando } from '../utils/formatters'
// Fix icon
// OLA4: iconos servidos en local (public/leaflet/) en vez de CDN unpkg (SPOF + integridad).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const MODOS_VIAJE = [
  { id: 'walking', etiqueta: 'A pie', icono: '🚶' },
  { id: 'driving', etiqueta: 'Auto', icono: '🚗' },
  { id: 'transit', etiqueta: 'Bus', icono: '🚌' },
]

/** Deep-link universal Google Maps (costo-cero: sin API key ni cuotas). */
export function buildGoogleMapsDirUrl({ origin, destination, travelmode = 'walking' }) {
  const params = new URLSearchParams({ api: '1', destination })
  if (origin) params.set('origin', origin)
  params.set('travelmode', travelmode)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function coordsValidas(p) {
  return p != null && p.lat !== '' && p.lng !== ''
    && !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng))
}

/** Auto-encuadre a los 2 puntos (004 POIs): la vista siempre muestra casa + lugar. */
function Encuadre({ puntos }) {
  const map = useMap()
  const clave = JSON.stringify(puntos)
  useEffect(() => {
    try {
      map.fitBounds(puntos, { padding: [60, 60] })
    } catch {
      // jsdom/tests sin mapa real: no rompe render
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave])
  return null
}

/** Re-centra cuando cambia el centro (MapContainer.center es inmutable tras mount). */
function Vista({ centro }) {
  const map = useMap()
  const clave = JSON.stringify(centro)
  useEffect(() => {
    try {
      map.setView(centro)
    } catch {
      // jsdom/tests sin mapa real: no rompe render
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave])
  return null
}

/**
 * MapaZona — tres casos (004 POIs):
 * - A (aviso + lugar/campus): 2 pines (casa + referencia) + línea punteada +
 *   fitBounds + "Cómo llegar". El `lugar` (dinámico del Detalle) precede a `campus`.
 * - B (aviso sin referencia): solo pin de la casa, zoom 16.
 * - Legacy (sin aviso): círculo + pin del campus, texto referencial.
 */
export default function MapaZona({
  zona = 'No informado',
  campus = { lat: 2.443, lng: -76.606 },
  lugar = null, // { lat, lng, nombre } | null — referencia dinámica (Detalle ?campus_id=)
  dist_m = null,
  aviso = null, // { lat, lng } | null
  direccion = '',
  titulo = '',
  onGeoError = null, // (msg) => void — el padre muestra el toast
}) {
  const [modoViaje, setModoViaje] = useState('walking')
  const [origenGps, setOrigenGps] = useState(null)
  const [buscandoGps, setBuscandoGps] = useState(false)
  const hasDist = dist_m != null && !Number.isNaN(Number(dist_m))
  const tiempo = hasDist ? formatTiempoCaminando(dist_m) : null
  const tieneAviso = coordsValidas(aviso)
  // 004: la referencia dinámica manda; `campus` queda como fallback legacy.
  const ref = coordsValidas(lugar) ? lugar : (coordsValidas(campus) ? campus : null)
  const nombreRef = (lugar && lugar.nombre) || 'Campus'
  const centro = tieneAviso
    ? [Number(aviso.lat), Number(aviso.lng)]
    : (ref ? [Number(ref.lat), Number(ref.lng)] : [2.443, -76.606])
  const destino = tieneAviso
    ? `${aviso.lat},${aviso.lng}`
    : (direccion ? `${direccion}, Popayán, Cauca` : null)
  const origen = origenGps || (ref ? `${ref.lat},${ref.lng}` : null)
  const gmapsUrl = destino
    ? buildGoogleMapsDirUrl({ origin: origen, destination: destino, travelmode: modoViaje })
    : null
  // FIX-OSM: el endpoint /directions con texto fallaba ("Búsqueda fallida",
  // mapa en Europa). Solo coords precisas con formato marcador; sin coords
  // no se renderiza el botón (solo Google Maps, que sí resuelve texto).
  const osmUrl = tieneAviso
    ? `https://www.openstreetmap.org/?mlat=${aviso.lat}&mlon=${aviso.lng}#map=17/${aviso.lat}/${aviso.lng}`
    : null
  const modoActual = MODOS_VIAJE.find(m => m.id === modoViaje) || MODOS_VIAJE[0]

  // "Cómo llegar desde mi ubicación": geolocalización SOLO a petición del
  // usuario (evita el prompt de permiso al abrir el Detalle). Si el navegador
  // la niega, el padre muestra el toast y se conserva el origen por defecto.
  const usarMiUbicacion = () => {
    if (!('geolocation' in navigator)) {
      if (onGeoError) onGeoError('Tu navegador no soporta geolocalización. Se usa la ruta desde el lugar de referencia.')
      return
    }
    setBuscandoGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false)
        setOrigenGps(`${pos.coords.latitude},${pos.coords.longitude}`)
      },
      () => {
        setBuscandoGps(false)
        if (onGeoError) onGeoError('No se pudo obtener tu ubicación. Se usa la ruta desde el lugar de referencia.')
      },
      { timeout: 8000 }
    )
  }

  return (
    <div className="w-full min-w-0">
      {/* BUG-01: stacking context propio para que los panes Leaflet (z 400-1000) queden debajo del nav (z-50) y del visor (z-[2000]) */}
      <div className="relative z-0 isolate rounded-xl overflow-hidden border border-neutral-200">
        <MapContainer
          center={centro}
          zoom={tieneAviso ? (ref ? 15 : 16) : 14}
          style={{ height: '300px', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <Vista centro={centro} />
          {tieneAviso && ref && (
            <Encuadre puntos={[[Number(aviso.lat), Number(aviso.lng)], [Number(ref.lat), Number(ref.lng)]]} />
          )}
          {tieneAviso ? (
            <>
              <Circle
                center={centro}
                radius={150}
                pathOptions={{ color: '#14213D', fillColor: '#14213D', fillOpacity: 0.12, weight: 1 }}
              />
              <Marker position={centro}>
                <Popup>
                  <span className="text-xs font-medium">{titulo || 'Inmueble'} — ubicación aproximada</span>
                  <br />
                  {hasDist ? (
                    <span className="text-xs text-neutral-500">{formatDistancia(dist_m)}{tiempo ? ` • ${tiempo} del campus` : ''}</span>
                  ) : (
                    <span className="text-xs text-neutral-500">Zona: {zona}</span>
                  )}
                </Popup>
              </Marker>
              {ref && (
                <>
                  <Marker position={[Number(ref.lat), Number(ref.lng)]}>
                    <Popup><span className="text-xs font-medium">{nombreRef}</span></Popup>
                  </Marker>
                  <Polyline
                    positions={[[Number(ref.lat), Number(ref.lng)], centro]}
                    pathOptions={{ color: '#14213D', weight: 1.5, dashArray: '6 6', opacity: 0.6 }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <Circle
                center={centro}
                radius={400}
                pathOptions={{ color: '#14213D', fillColor: '#14213D', fillOpacity: 0.08, weight: 1 }}
              />
              {ref && (
                <Marker position={[Number(ref.lat), Number(ref.lng)]}>
                  <Popup>
                    <span className="text-xs font-medium">{nombreRef} — Zona: {zona}</span>
                    <br />
                    {hasDist ? (
                      <span className="text-xs text-neutral-500">{formatDistancia(dist_m)}{tiempo ? ` • ${tiempo} del campus` : ''}</span>
                    ) : (
                      <span className="text-xs text-neutral-500">Distancia no informada</span>
                    )}
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>
      </div>
      {/* UX: texto limpio para el estudiante (sin jerga "Haversine/geodésica") */}
      <p className="text-xs text-neutral-400 mt-2">
        {tieneAviso ? (
          <>Ubicación aproximada (radio 150 m, no es la dirección exacta){hasDist ? <> · {tiempo ? `${tiempo} del campus` : `${formatDistancia(dist_m)} del campus`}</> : null}</>
        ) : hasDist ? (
          <>Zona referencial: {zona} · {tiempo ? `${tiempo} del campus` : `${formatDistancia(dist_m)} del campus`}</>
        ) : (
          <>Ubicación exacta no informada · mapa referencial del campus (no usar como distancia real)</>
        )}
      </p>
      {gmapsUrl && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-1 self-start rounded-full bg-neutral-100 p-1" role="group" aria-label="Modo de viaje">
              {MODOS_VIAJE.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModoViaje(m.id)}
                  aria-pressed={modoViaje === m.id}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition ${modoViaje === m.id ? 'bg-white text-navy-900 shadow-sm' : 'text-neutral-500 hover:text-navy-800'}`}
                >
                  <span aria-hidden="true">{m.icono}</span> {m.etiqueta}
                </button>
              ))}
            </div>
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex w-full md:w-auto md:flex-1 md:max-w-xs items-center justify-center gap-2 px-4 py-3 bg-navy-800 text-white font-semibold text-sm rounded-lg hover:bg-navy-900 active:scale-[0.98] transition"
            >
              <span aria-hidden="true">{modoActual.icono}</span> Cómo llegar en Google Maps
            </a>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              type="button"
              onClick={usarMiUbicacion}
              disabled={buscandoGps}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-navy-700 hover:text-navy-900 hover:underline transition disabled:opacity-50"
            >
              <span aria-hidden="true">📍</span> {origenGps ? 'Ruta desde mi ubicación ✓' : (buscandoGps ? 'Ubicándote…' : 'Cómo llegar desde mi ubicación')}
            </button>
            {osmUrl && (
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 hover:text-navy-800 hover:underline transition"
              >
                <span aria-hidden="true">🗺️</span> Abrir ubicación en OpenStreetMap
              </a>
            )}
          </div>
          {!tieneAviso && (
            <p className="text-[11px] text-neutral-400 mt-2">Destino aproximado por dirección referencial — confirma por WhatsApp.</p>
          )}
        </div>
      )}
    </div>
  )
}
