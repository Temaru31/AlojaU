import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { reverseGeocode } from '../utils/geocode'

// Iconos locales (mismo fix que MapaZona: sin CDN unpkg).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const POPAYAN = { lat: 2.443, lng: -76.606 }

function ClickParaMover({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/**
 * MapPicker — captura síncrona de coords (Oleada 2, sin PENDING_GEOCODE).
 * Clic o arrastre actualizan lat/lng directo en el formulario padre.
 * Al soltar, reverse-geocode ligero (Nominatim + caché 30d) sugiere la
 * dirección textual; si falla, el usuario la digita manual.
 */
export default function MapPicker({ lat, lng, onChange, onAddressSuggestion, onGeoError }) {
  const tienePunto = lat !== '' && lng !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
  const centro = tienePunto ? [Number(lat), Number(lng)] : [POPAYAN.lat, POPAYAN.lng]
  const [sugerencia, setSugerencia] = useState('')
  const [buscandoDir, setBuscandoDir] = useState(false)
  const seq = useRef(0)

  const pick = (nuevaLat, nuevaLng) => {
    onChange(Number(nuevaLat.toFixed(7)), Number(nuevaLng.toFixed(7)))
  }

  // Reverse-geocode al fijar punto (debounce implícito: solo tras pick estable).
  useEffect(() => {
    if (!tienePunto) { setSugerencia(''); return }
    const id = ++seq.current
    setBuscandoDir(true)
    const t = window.setTimeout(async () => {
      const dir = await reverseGeocode(Number(lat), Number(lng))
      if (seq.current === id) {
        setSugerencia(dir || '')
        setBuscandoDir(false)
      }
    }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  // Edge case GPS denegado: toast elegante del padre; el pin manual sigue disponible.
  const GEO_ERROR_MSG = 'No se pudo obtener tu ubicación. Por favor ubica el pin manualmente en el mapa.'
  const usarUbicacion = () => {
    if (!('geolocation' in navigator)) {
      if (onGeoError) onGeoError(GEO_ERROR_MSG)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude),
      () => { if (onGeoError) onGeoError(GEO_ERROR_MSG) },
      { timeout: 8000 }
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative z-0 isolate rounded-xl overflow-hidden border border-neutral-200">
        <MapContainer
          center={centro}
          zoom={tienePunto ? 16 : 13}
          style={{ height: '260px', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <ClickParaMover onPick={pick} />
          {tienePunto && (
            <Marker
              position={[Number(lat), Number(lng)]}
              draggable
              eventHandlers={{ dragend: (e) => {
                const m = e.target.getLatLng()
                pick(m.lat, m.lng)
              } }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={usarUbicacion}
          className="text-[11px] font-medium text-navy-700 border border-navy-200 rounded-md px-2.5 py-1.5 hover:bg-navy-50 transition"
        >
          📍 Usar mi ubicación
        </button>
        <span className="text-[11px] text-neutral-400">
          {tienePunto
            ? `Pin: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} — clic o arrastra para ajustar`
            : 'Clic en el mapa para ubicar el inmueble'}
        </span>
      </div>
      {buscandoDir && <p className="text-[11px] text-neutral-400">Buscando dirección sugerida…</p>}
      {sugerencia && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md bg-neutral-50 border border-neutral-200 p-2.5">
          <p className="text-[11px] text-neutral-600 flex-1 line-clamp-2" title={sugerencia}>
            Sugerencia OSM: {sugerencia}
          </p>
          <button
            type="button"
            onClick={() => onAddressSuggestion && onAddressSuggestion(sugerencia)}
            className="text-[11px] font-semibold text-navy-700 hover:text-navy-900 hover:underline shrink-0"
          >
            Usar esta dirección
          </button>
        </div>
      )}
    </div>
  )
}
