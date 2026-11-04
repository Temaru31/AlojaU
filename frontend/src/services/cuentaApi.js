// Cuenta del usuario: acceso (login, registro, OTP, recuperación, Google),
// perfil y avatar, vinculación de Telegram y sesiones. Los componentes llaman a
// estas funciones (devuelven `data`), no a las URLs.
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

/** Login con correo y contraseña: `{ access_token, ... }`. */
export async function loginConPassword(email, password) {
  return (await api.post('/api/auth/login', { email, password })).data
}

export async function registrarCuenta(datos) {
  return (await api.post('/api/auth/register', datos)).data
}

/** Crea o vincula la cuenta con los datos que devolvió Google (Supabase). */
export async function loginConGoogle(datos) {
  return (await api.post('/api/auth/oauth/google/callback', datos)).data
}

/** Pide un código de 6 dígitos; `{ canal: 'email' | 'telegram', ... }`. */
export async function solicitarOtp(email, proposito) {
  return (await api.post('/api/auth/otp/solicitar', { email, proposito })).data
}

export function verificarOtp(email, codigo, proposito) {
  return api.post('/api/auth/otp/verificar', { email, codigo, proposito })
}

export async function solicitarRecuperacion(email) {
  return (await api.post('/api/auth/recovery/solicitar', { email })).data
}

export function confirmarRecuperacion(email, token, nuevaPassword) {
  return api.post('/api/auth/recovery/confirmar', { email, token, nueva_password: nuevaPassword })
}

/** Sube la foto de perfil; devuelve `{ foto_perfil_url }`. */
export async function subirAvatar(archivo, token) {
  const fd = new FormData()
  fd.append('file', archivo)
  const head = token ? authHead(token) : {}
  return (await api.post('/api/auth/avatar', fd, {
    ...head,
    headers: { ...(head.headers || {}), 'Content-Type': 'multipart/form-data' },
  })).data
}

export async function quitarAvatar(token) {
  return (await api.delete('/api/auth/avatar', token ? authHead(token) : {})).data
}
