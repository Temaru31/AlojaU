import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { formatTiempoCaminando } from '../utils/formatters'
// Fix icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function MapaZona({ zona = 'No informado', campus = { lat: 2.443, lng: -76.606 }, dist_m = null }) {
  const hasDist = dist_m != null && !Number.isNaN(Number(dist_m))
  const tiempo = hasDist ? formatTiempoCaminando(dist_m) : null
  return (
    <div className="w-full min-w-0">
      {/* BUG-01: stacking context propio para que los panes Leaflet (z 400-1000) queden debajo del nav (z-50) y del visor (z-[2000]) */}
      <div className="relative z-0 isolate rounded-xl overflow-hidden border border-neutral-200">
        <MapContainer
          center={[campus.lat, campus.lng]}
          zoom={14}
          style={{ height: '300px', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
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
                <span className="text-xs text-neutral-500">~{dist_m}m geodesica{tiempo ? ` • ${tiempo}` : ''}</span>
              ) : (
                <span className="text-xs text-neutral-500">Distancia no informada</span>
              )}
            </Popup>
          </Marker>
        </MapContainer>
      </div>
      <p className="text-xs text-neutral-400 mt-2">
        {hasDist ? (
          <>Zona referencial: {zona} · {dist_m}m del campus{tiempo ? ` · ${tiempo}` : ''} (Haversine, no tiempo a pie)</>
        ) : (
          <>Ubicación exacta no informada · mapa referencial del campus (no usar como distancia real)</>
        )}
      </p>
    </div>
  )
}
