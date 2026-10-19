import { describe, it, expect, vi } from 'vitest'
import {
  api,
  getEnumsPreferencias,
  guardarPreferenciasUsuario,
  getCandidatosRoomies,
} from './api'

describe('api roomie y preferencias (HU-12 / HU-13)', () => {
  it('getEnumsPreferencias llama a GET /api/preferencias/enums', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { enums: [] } })
    const res = await getEnumsPreferencias()

    expect(getSpy).toHaveBeenCalledWith('/api/preferencias/enums')
    expect(res.data.enums).toEqual([])
  })

  it('guardarPreferenciasUsuario llama a PATCH /api/auth/perfil con cabecera de autenticación', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: { id: 1 } })
    const payload = { 'roomie.aseo_momento_semana': 'entre_semana' }
    await guardarPreferenciasUsuario(payload, 'token-123')

    expect(patchSpy).toHaveBeenCalledWith(
      '/api/auth/perfil',
      { preferencias: payload },
      { headers: { Authorization: 'Bearer token-123' } },
    )
  })

  it('getCandidatosRoomies llama a GET /api/matching/candidatos con límite y auth', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] })
    await getCandidatosRoomies('token-456', { limite: 15 })

    expect(getSpy).toHaveBeenCalledWith('/api/matching/candidatos', {
      params: { limite: 15 },
      headers: { Authorization: 'Bearer token-456' },
    })
  })
})
