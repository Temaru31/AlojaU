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
// HU-003: Mapa solo zona referencial, no pin exacto de publicación - con tiempo caminando realista
export default function MapaZona({ zona="Pandiguando", campus={lat:2.443,lng:-76.606}, dist_m=320 }){
  const tiempo = formatTiempoCaminando(dist_m)
  return (
    <div className="w-full min-w-0">
      <MapContainer center={[campus.lat, campus.lng]} zoom={14} className="w-full h-64 sm:h-72 md:h-[300px] rounded-xl" style={{ width: '100%', minHeight: '260px' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        <Circle center={[campus.lat, campus.lng]} radius={400} />
        <Marker position={[campus.lat, campus.lng]}>
          <Popup>Campus • Zona: {zona} • {dist_m}m • {tiempo} (estimado)</Popup>
        </Marker>
      </MapContainer>
      <p className="text-[11px] sm:text-xs text-gray-500 mt-2 break-words">
        Zona referencial: {zona} • {dist_m}m del campus{tiempo ? ` • ${tiempo}` : ''} <span className="text-[10px]">(distancia recta Haversine, tiempo estimado a 80m/min sin ruteo)</span>
      </p>
    </div>
  )
}
