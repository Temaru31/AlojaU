// useTiposVivienda — Catálogo dinámico de tipos (M2).
// Consume /config-publica (extendido aditivamente con `tipos_vivienda`),
// con fallback local si la red falla o el backend es viejo.
// Uso:
//   const { tipos, nombreDe, cargando } = useTiposVivienda()
// `tipos` = [{slug, nombre_visible, descripcion_tooltip, icono, esta_activo}]
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { fetchConfigPublica, leerConfigCache } from '../constants'

// Fallback local (espejo del seed backend, nunca se elimina un slug).
export const TIPOS_FALLBACK = [
  { slug: 'HABITACION_FAMILIAR', nombre_visible: 'Habitación familiar', descripcion_tooltip: 'Habitación en casa de familia', icono: '🏠', esta_activo: true },
  { slug: 'HABITACION_INDEPENDIENTE', nombre_visible: 'Habitación independiente', descripcion_tooltip: 'Habitación privada', icono: '🚪', esta_activo: true },
  { slug: 'APARTAESTUDIO', nombre_visible: 'Apartaestudio', descripcion_tooltip: 'Ambiente integrado', icono: '🏢', esta_activo: true },
  { slug: 'COMPARTIDO', nombre_visible: 'Compartido', descripcion_tooltip: 'Cupo compartido', icono: '🤝', esta_activo: true },
  { slug: 'APARTAMENTO_COMPLETO', nombre_visible: 'Apartamento completo', descripcion_tooltip: 'Apartamento entero', icono: '🏘️', esta_activo: true },
  { slug: 'HABITACION_PISO_COMPARTIDO', nombre_visible: 'Habitación en piso compartido', descripcion_tooltip: 'Habitación en piso común', icono: '🏡', esta_activo: true },
]

export function nombreTipo(tipos, slug, fallback = null) {
  const hit = (tipos || []).find((t) => t.slug === slug)
  if (hit) return hit.nombre_visible || slug
  const fb = TIPOS_FALLBACK.find((t) => t.slug === slug)
  if (fb) return fb.nombre_visible
  return fallback ?? slug ?? 'No informado'
}

export default function useTiposVivienda() {
  const [tipos, setTipos] = useState(() => {
    try {
      const cfg = leerConfigCache()
      if (Array.isArray(cfg?.tipos_vivienda) && cfg.tipos_vivienda.length > 0) return cfg.tipos_vivienda
    } catch { /* fallback */ }
    return TIPOS_FALLBACK
  })
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vivo = true
    // Si ya hay caché con tipos, no refetchear.
    try {
      const cfg = leerConfigCache()
      if (Array.isArray(cfg?.tipos_vivienda) && cfg.tipos_vivienda.length > 0) return () => { vivo = false }
    } catch { /* sigue a fetch */ }
    setCargando(true)
    fetchConfigPublica(() => api.get('/api/publicaciones/config-publica').then((r) => r.data))
      .then((cfg) => {
        if (!vivo) return
        if (Array.isArray(cfg?.tipos_vivienda) && cfg.tipos_vivienda.length > 0) {
          setTipos(cfg.tipos_vivienda)
        }
      })
      .catch(() => { /* fallback local */ })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  return {
    tipos,
    cargando,
    nombreDe: (slug, fb = null) => nombreTipo(tipos, slug, fb),
  }
}
