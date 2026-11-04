// Preferencias de convivencia y matching de roomies (HU-12 / HU-13).
import { api } from './api'
import { authHead } from './authHeaders'

/** Catálogo público de enums de preferencias (9 enums del PDF). Sin auth. */
export function getEnumsPreferencias() {
  return api.get('/api/preferencias/enums')
}

/** Guarda o actualiza preferencias del usuario actual en usuarios.preferencias (JSONB). */
export function guardarPreferenciasUsuario(preferencias, token) {
  return api.patch('/api/auth/perfil', { preferencias }, authHead(token))
}

/** Obtiene candidatos de roomies rankeados por afinidad. Requiere rol ESTUDIANTE. */
export function getCandidatosRoomies(token, { limite = 20 } = {}) {
  return api.get('/api/matching/candidatos', {
    params: { limite },
    ...authHead(token),
  })
}
