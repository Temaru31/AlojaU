// Token JWT de la sesión en localStorage (única fuente de la clave).
// Tolerante a storage bloqueado (modo privado, SSR, tests): nunca lanza.

export const TOKEN_KEY = 'alojau_token'

export function leerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function guardarToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // storage no disponible: la sesión vive solo en memoria
  }
}

export function borrarToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage no disponible: nada que borrar
  }
}
