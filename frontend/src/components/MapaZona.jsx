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

export default function MapaZona({ zona = 'Pandiguando', campus = { lat: 2.443, lng: -76.606 }, dist_m = 320 }) {
  const tiempo = formatTiempoCaminando(dist_m)
  return (
    <div className="w-full min-w-0">
      <div className="rounded-xl overflow-hidden border border-neutral-200">
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
              <span className="text-xs text-neutral-500">~{dist_m}m geodesica{tiempo ? ` • ${tiempo}` : ''}</span>
            </Popup>
          </Marker>
        </MapContainer>
      </div>
      <p className="text-xs text-neutral-400 mt-2">
        Zona referencial: {zona} · {dist_m}m del campus{tiempo ? ` · ${tiempo}` : ''} (Haversine, no tiempo a pie)
      </p>
    </div>
  )
}
