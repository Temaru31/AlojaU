import { useState } from 'react'
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline } from 'react-leaflet'
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
  { id: 'walking', etiqueta: 'A pie' },
  { id: 'driving', etiqueta: 'Auto' },
  { id: 'transit', etiqueta: 'Bus' },
]

/** Deep-link universal Google Maps (costo-cero: sin API key ni cuotas). */
export function buildGoogleMapsDirUrl({ origin, destination, travelmode = 'walking' }) {
  const params = new URLSearchParams({ api: '1', destination })
  if (origin) params.set('origin', origin)
  params.set('travelmode', travelmode)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/**
 * MapaZona — dos modos (Oleada 2):
 * - campus (default, compatible): círculo + pin del campus, texto referencial.
 * - aviso: pin aproximado del inmueble (círculo 150m, sin dirección exacta)
 *   + línea punteada al campus + botón "Cómo llegar en Google Maps" (deep-link).
 */
export default function MapaZona({
  zona = 'No informado',
  campus = { lat: 2.443, lng: -76.606 },
  dist_m = null,
  aviso = null, // { lat, lng } | null
  direccion = '',
  titulo = '',
}) {
  const [modoViaje, setModoViaje] = useState('walking')
  const hasDist = dist_m != null && !Number.isNaN(Number(dist_m))
  const tiempo = hasDist ? formatTiempoCaminando(dist_m) : null
  const tieneAviso = aviso != null
    && aviso.lat !== '' && aviso.lng !== ''
    && !Number.isNaN(Number(aviso.lat)) && !Number.isNaN(Number(aviso.lng))
  const centro = tieneAviso ? [Number(aviso.lat), Number(aviso.lng)] : [campus.lat, campus.lng]
  const destino = tieneAviso
    ? `${aviso.lat},${aviso.lng}`
    : (direccion ? `${direccion}, Popayán, Cauca` : null)
  const gmapsUrl = destino
    ? buildGoogleMapsDirUrl({ origin: `${campus.lat},${campus.lng}`, destination: destino, travelmode: modoViaje })
    : null
  const osmUrl = destino
    ? `https://www.openstreetmap.org/directions?from=${campus.lat}%2C${campus.lng}&to=${encodeURIComponent(destino)}`
    : null

  return (
    <div className="w-full min-w-0">
      {/* BUG-01: stacking context propio para que los panes Leaflet (z 400-1000) queden debajo del nav (z-50) y del visor (z-[2000]) */}
      <div className="relative z-0 isolate rounded-xl overflow-hidden border border-neutral-200">
        <MapContainer
          center={centro}
          zoom={tieneAviso ? 15 : 14}
          style={{ height: '300px', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
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
              <Marker position={[campus.lat, campus.lng]}>
                <Popup><span className="text-xs font-medium">Campus</span></Popup>
              </Marker>
              <Polyline
                positions={[[campus.lat, campus.lng], centro]}
                pathOptions={{ color: '#14213D', weight: 1.5, dashArray: '6 6', opacity: 0.6 }}
              />
            </>
          ) : (
            <>
              <Circle
                center={[campus.lat, campus.lng]}
                radius={400}
                pathOptions={{ color: '#14213D', fillColor: '#14213D', fillOpacity: 0.08, weight: 1 }}
              />
              <Marker position={[campus.lat, campus.lng]}>
                <Popup>
                  <span className="text-xs font-medium">Campus — Zona: {zona}</span>
                  <br />
                  {hasDist ? (
                    <span className="text-xs text-neutral-500">{formatDistancia(dist_m)}{tiempo ? ` • ${tiempo} del campus` : ''}</span>
                  ) : (
                    <span className="text-xs text-neutral-500">Distancia no informada</span>
                  )}
                </Popup>
              </Marker>
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
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5" role="group" aria-label="Modo de viaje">
            {MODOS_VIAJE.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModoViaje(m.id)}
                aria-pressed={modoViaje === m.id}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition ${modoViaje === m.id ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-neutral-600 border-neutral-200 hover:border-navy-300'}`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-navy-800 text-white font-medium text-xs rounded-md hover:bg-navy-900 active:scale-95 transition flex-1"
            >
              <span aria-hidden="true">🧭</span> Cómo llegar en Google Maps
            </a>
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-neutral-600 border border-neutral-200 rounded-md hover:border-navy-300 hover:text-navy-800 transition"
            >
              Abrir en OSM
            </a>
          </div>
          {!tieneAviso && (
            <p className="text-[11px] text-neutral-400 mt-2">Destino aproximado por dirección referencial — confirma por WhatsApp.</p>
          )}
        </div>
      )}
    </div>
  )
}
