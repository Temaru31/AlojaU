// tiposVivienda — FUENTE ÚNICA de etiquetas del catálogo (Bloque 3).
// Antes cada página tenía su propio mapa slug->nombre (7 archivos) y un
// slug nuevo se veía distinto según la pantalla. Ahora: lista dinámica
// (backend housing_types vía useTiposVivienda) primero, espejo estático
// TIPOS_FALLBACK después, slug crudo al final. Pura (sin hooks) para poder
// usarse dentro de humanizarTipo* y cualquier helper.
// Uso: getEtiquetaTipo(slug, tiposDelHook) o getEtiquetaTipo(slug).
import { TIPOS_FALLBACK } from '../hooks/useTiposVivienda'

export function getEtiquetaTipo(slug, tipos = null, vacio = 'No informado') {
  if (slug == null || slug === '') return vacio
  const lista = Array.isArray(tipos) ? tipos : []
  const hit = lista.find((t) => t && t.slug === slug)
  if (hit && hit.nombre_visible) return hit.nombre_visible
  const fb = TIPOS_FALLBACK.find((t) => t.slug === slug)
  if (fb) return fb.nombre_visible
  return String(slug)
}
