import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
// Fix icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})
// HU-003: Mapa solo zona referencial, no pin exacto de publicación
export default function MapaZona({ zona="Pandiguando", campus={lat:2.443,lng:-76.606}, dist_m=320 }){
  return (
    <div>
      <MapContainer center={[campus.lat, campus.lng]} zoom={14} style={{height: '300px', borderRadius: '0.5rem'}}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        <Circle center={[campus.lat, campus.lng]} radius={400} />
        <Marker position={[campus.lat, campus.lng]}>
          <Popup>Campus • Zona: {zona} • ~{dist_m}m geodésica (no ruteo)</Popup>
        </Marker>
      </MapContainer>
      <p className="text-xs text-gray-500 mt-1">Zona referencial: {zona} • {dist_m}m del campus (Haversine, no tiempo a pie)</p>
    </div>
  )
}
