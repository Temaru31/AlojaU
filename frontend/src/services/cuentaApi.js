// Cuenta del usuario: perfil, vinculación de Telegram y sesiones. Los
// componentes llaman a estas funciones (devuelven `data`), no a las URLs.
import { api } from './api'
import { authHead } from './authHeaders'

export async function obtenerPerfil(token) {
  return (await api.get('/api/auth/perfil', authHead(token))).data
}

export async function actualizarPerfil(cambios, token) {
  return (await api.patch('/api/auth/perfil', cambios, authHead(token))).data
}

export function cambiarPassword(actual, nueva, token) {
  return api.patch('/api/auth/perfil/password', { actual, nueva }, authHead(token))
}

/** Deep link firmado al bot: `{ bot_url, expira_segundos }`. */
export async function enlaceTelegram(token) {
  return (await api.get('/api/auth/telegram/enlace', authHead(token))).data
}

export function desvincularTelegram(token) {
  return api.post('/api/auth/telegram/desvincular', {}, authHead(token))
}

export async function listarSesiones(token) {
  const data = (await api.get('/api/auth/sesiones', authHead(token))).data
  return Array.isArray(data) ? data : []
}

export function revocarTodasLasSesiones(token) {
  return api.post('/api/auth/sesiones/revocar-todas', {}, authHead(token))
}

/** Borrado de cuenta (Ley 1581): DELETE con cuerpo de confirmación. */
export function eliminarCuenta(confirmEmail, password, token) {
  return api.request({
    method: 'delete',
    url: '/api/auth/cuenta',
    data: { confirm_email: confirmEmail, password: password || undefined },
    ...authHead(token),
  })
}

export function cerrarSesion(token) {
  return api.post('/api/auth/logout', {}, authHead(token))
}
