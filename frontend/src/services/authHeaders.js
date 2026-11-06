// Cabeceras de autenticación para el cliente `api` (funciones puras, sin red).
// Uso: api.get(url, authHead(token)) o headers: { ...bearer(token), 'Content-Type': ... }.

/** Cabecera Authorization sola (para combinar con otras); vacía sin token. */
export const bearer = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

/** Config de axios con la cabecera Authorization Bearer. */
export const authHead = (token) => ({ headers: { Authorization: `Bearer ${token}` } })
