// TipoIcono — Icono Lucide para un tipo de vivienda.
// El campo `icono` del catálogo (BD/seed/fallback) guarda el NOMBRE del icono
// ('house', 'door-open', 'building', 'handshake', 'building-2', 'home').
// Por compatibilidad con datos viejos, los emojis legacy se mapean al nombre
// equivalente en vez de romperse.
// Uso: <TipoIcono icono={t.icono} className="w-4 h-4" />
import { Building, Building2, DoorOpen, Handshake, Home, House } from 'lucide-react'

export const ICONOS_TIPO = {
  house: House,
  'door-open': DoorOpen,
  building: Building,
  handshake: Handshake,
  'building-2': Building2,
  home: Home,
}

const LEGACY_EMOJI = {
  '🏠': 'house',
  '🚪': 'door-open',
  '🏢': 'building',
  '🤝': 'handshake',
  '🏘️': 'building-2',
  '🏘': 'building-2',
  '🏡': 'home',
}

export function iconoTipoANombre(valor) {
  if (!valor) return 'home'
  const v = String(valor).trim()
  if (ICONOS_TIPO[v]) return v
  if (LEGACY_EMOJI[v]) return LEGACY_EMOJI[v]
  return 'home'
}

export default function TipoIcono({ icono, className = 'w-4 h-4' }) {
  const Comp = ICONOS_TIPO[iconoTipoANombre(icono)] || Home
  return <Comp aria-hidden="true" focusable="false" className={`shrink-0 ${className}`} />
}
