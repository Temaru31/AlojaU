import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MisPublicaciones from './MisPublicaciones'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import { api } from '../services/api'
import * as Auth from '../contexts/AuthContext'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const renderPage = (token) => {
  vi.spyOn(Auth, 'useAuth').mockReturnValue({
    token, user: token ? { email: 'arrendador@alojau.com' } : null,
    loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
  })
  return render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
}

// Backend paginado real: {items,total,page,size,pages}
const paged = (items, total = items.length) => ({ items, total, page: 1, size: 12, pages: Math.max(1, Math.ceil(total / 12)) })
const pub1 = { id: 3, titulo: 'Habitación Tulcán', canon_mensual: 380000, estado: 'PENDIENTE', indice_confianza: 70, distancia_geodesica_m: 111 }

describe('MisPublicaciones', () => {
  it('sin token: invita a iniciar sesión', () => {
    renderPage('')
    expect(screen.getByText(/Inicia sesión para ver tus publicaciones/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi Perfil / Iniciar Sesión' })).toHaveAttribute('href', '/perfil')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lista avisos paginados con estado legible (nunca enum crudo)', async () => {
    api.get.mockResolvedValue({ data: paged([pub1,
      { id: 1, titulo: 'Habitación cerca Tulcán', canon_mensual: 450000, estado: 'ACTIVO', indice_confianza: 95, distancia_geodesica_m: 320 },
    ], 2) })
    renderPage('tok')
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    // Badge dentro de la tarjeta (el chip de filtro tiene el mismo texto: se acota por article)
    const card = screen.getByText('Habitación Tulcán').closest('article')
    expect(within(card).getByText('En revisión')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    // UX: nunca el enum crudo de BD
    expect(screen.queryByText('ACTIVO')).not.toBeInTheDocument()
    expect(screen.queryByText('PENDIENTE')).not.toBeInTheDocument()
  })

  it('filtro En revisión pide estado=PENDIENTE al backend', async () => {
    api.get.mockResolvedValue({ data: paged([pub1], 1) })
    renderPage('tok')
    await screen.findByText('Habitación Tulcán')
    fireEvent.click(screen.getByRole('button', { name: 'En revisión' }))
    await screen.findByText('Habitación Tulcán')
    const lastCall = api.get.mock.calls.at(-1)
    expect(lastCall[0]).toBe('/api/publicaciones/mias')
    expect(lastCall[1].params.estado).toBe('PENDIENTE')
    expect(lastCall[1].headers.Authorization).toMatch(/^Bearer /)
  })

  it('vacío: invita a publicar', async () => {
    api.get.mockResolvedValue({ data: paged([]) })
    renderPage('tok')
    expect(await screen.findByText(/Aún no publicas nada/)).toBeInTheDocument()
  })

  it('401: mensaje de sesión vencida + Reintentar', async () => {
    api.get.mockRejectedValue({ response: { status: 401 } })
    renderPage('tok')
    expect(await screen.findByText(/Sesión vencida/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})

describe('EditarPublicacionModal', () => {
  const renderModal = (onSaved = vi.fn()) => render(
    <MemoryRouter>
      <EditarPublicacionModal
        pub={{ id: 1, titulo: 'Habitación cerca Tulcán - 320m', descripcion: 'Descripción con más de veinte caracteres ok', tipo_inmueble: 'APARTAESTUDIO', canon_mensual: 500000, deposito_requerido: 0, direccion_referencial: 'Calle 5 # 2-10 Tulcán', reglas_convivencia: 'Reglas de convivencia claras' }}
        token="tok"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </MemoryRouter>
  )

  it('valida mínimo local antes de llamar al backend', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'corto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Título: mínimo 10/)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('guarda PATCH y avisa al padre', async () => {
    const onSaved = vi.fn()
    api.patch.mockResolvedValue({ data: { id: 1, titulo: 'Habitación cerca Tulcán - 320m' } })
    renderModal(onSaved)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/publicaciones/1', expect.objectContaining({ titulo: 'Habitación cerca Tulcán - 320m' }), expect.anything()))
    expect(onSaved).toHaveBeenCalled()
  })

  it('403 muestra permiso denegado', async () => {
    api.patch.mockRejectedValue({ response: { status: 403 } })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Solo el dueño/)).toBeInTheDocument()
  })
})
