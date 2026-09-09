import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MisPublicaciones from './MisPublicaciones'
import { api } from '../services/api'
import * as Auth from '../contexts/AuthContext'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const renderPage = (token) => {
  vi.spyOn(Auth, 'useAuth').mockReturnValue({
    token, user: token ? { email: 'arrendador@alojau.com' } : null,
    loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
  })
  return render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
}

describe('MisPublicaciones', () => {
  it('sin token: invita a iniciar sesión', () => {
    renderPage('')
    expect(screen.getByText(/Inicia sesión para ver tus publicaciones/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi Perfil / Iniciar Sesión' })).toHaveAttribute('href', '/perfil')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lista avisos con estado legible (En revisión, no PENDIENTE crudo)', async () => {
    api.get.mockResolvedValue({ data: [
      { id: 3, titulo: 'Habitación Tulcán', canon_mensual: 380000, estado: 'PENDIENTE', indice_confianza: 70, distancia_geodesica_m: 111 },
      { id: 1, titulo: 'Habitación cerca Tulcán', canon_mensual: 450000, estado: 'ACTIVO', indice_confianza: 95, distancia_geodesica_m: 320 },
    ] })
    renderPage('tok')
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    expect(screen.getByText('En revisión')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    // UX: nunca el enum crudo de BD
    expect(screen.queryByText('ACTIVO')).not.toBeInTheDocument()
    expect(screen.queryByText('PENDIENTE')).not.toBeInTheDocument()
  })

  it('vacío: invita a publicar', async () => {
    api.get.mockResolvedValue({ data: [] })
    renderPage('tok')
    expect(await screen.findByText(/Aún no publicas nada/)).toBeInTheDocument()
  })

  it('401: mensaje de sesión vencida', async () => {
    api.get.mockRejectedValue({ response: { status: 401 } })
    renderPage('tok')
    expect(await screen.findByText(/Sesión vencida/)).toBeInTheDocument()
  })
})
