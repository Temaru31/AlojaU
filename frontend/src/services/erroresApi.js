const PREFIJO_PYDANTIC = /^Value error,\s*/

function textoDeValidacion(item, conCampo) {
  const msg = typeof item?.msg === 'string' ? item.msg.replace(PREFIJO_PYDANTIC, '') : ''
  if (!msg) return ''
  const campo = Array.isArray(item?.loc) ? item.loc.join('.') : ''
  return conCampo && campo ? `${campo}: ${msg}` : msg
}

// Texto que se puede pintar a partir de un error de la API. `detail` del
// backend puede ser texto (HTTPException) o una lista de objetos (422 de
// validación): pintar la lista tal cual hace fallar a React.
export function mensajeDeError(err, porDefecto, { conCampo = false } = {}) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const texto = detail.map(item => textoDeValidacion(item, conCampo)).filter(Boolean).join(' | ')
    if (texto) return texto
  }
  return porDefecto
}
