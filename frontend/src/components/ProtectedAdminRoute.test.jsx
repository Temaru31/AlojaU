import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedAdminRoute from './ProtectedAdminRoute'
import AdminDashboard from '../pages/AdminDashboard'
import * as Auth from '../contexts/AuthContext'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const authState = (over = {}) => ({
  token: '', user: null, loading: false,
  login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), ...over,
})

const renderGuard = (auth, path = '/admin/dashboard') => {
  vi.spyOn(Auth, 'useAuth').mockReturnValue(authState(auth))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>PAGINA INICIO</div>} />
        <Route path="/perfil" element={<div>PAGINA PERFIL</div>} />
        <Route path="/admin/dashboard" element={<ProtectedAdminRoute><div>PANEL SECRETO</div></ProtectedAdminRoute>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedAdminRoute', () => {
  it('sin token redirige a /perfil', () => {
    renderGuard({ token: '' })
    expect(screen.getByText('PAGINA PERFIL')).toBeInTheDocument()
    expect(screen.queryByText('PANEL SECRETO')).not.toBeInTheDocument()
  })

  it('no-ADMIN redirige a /', () => {
    renderGuard({ token: 't', user: { email: 'a@a.co', rol: 'ARRENDADOR' } })
    expect(screen.getByText('PAGINA INICIO')).toBeInTheDocument()
    expect(screen.queryByText('PANEL SECRETO')).not.toBeInTheDocument()
  })

  it('ADMIN entra al panel', () => {
    renderGuard({ token: 't', user: { email: 'admin@alojau.com', rol: 'ADMIN' } })
    expect(screen.getByText('PANEL SECRETO')).toBeInTheDocument()
  })

  it('cargando muestra skeleton (no redirige)', () => {
    renderGuard({ token: 't', user: null, loading: true })
    expect(screen.queryByText('PANEL SECRETO')).not.toBeInTheDocument()
    expect(screen.queryByText('PAGINA PERFIL')).not.toBeInTheDocument()
  })
})

describe('AdminDashboard', () => {
  const renderDash = () => {
    vi.spyOn(Auth, 'useAuth').mockReturnValue(authState({ token: 't', user: { email: 'admin@alojau.com', rol: 'ADMIN' } }))
    return render(<MemoryRouter><AdminDashboard /></MemoryRouter>)
  }

  it('muestra métricas y pendientes con acciones', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/admin/metricas') return Promise.resolve({ data: {
        total_publicaciones: 6, activas: 5, pendientes: 1,
        reportes_activos: 2, reportes_pendientes: 2, arrendadores_verificados: 1, total_usuarios: 2,
      } })
      return Promise.resolve({ data: { items: [
        { id: 9, titulo: 'Aviso por revisar', canon_mensual: 400000, estado: 'PENDIENTE', indice_confianza: 70, usuario_id: 1 },
      ], total: 1, page: 1, size: 10, pages: 1 } })
    })
    renderDash()
    expect(await screen.findByText(/Panel Administrador/)).toBeInTheDocument()
    expect(screen.getByText('Aviso por revisar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar aviso 9' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar aviso 9' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bandeja de reportes/ })).toHaveAttribute('href', '/admin/reportes')
  })

  it('aprobar llama al endpoint y recarga', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/admin/metricas') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: { items: [
        { id: 9, titulo: 'Aviso por revisar', canon_mensual: 400000, estado: 'PENDIENTE', indice_confianza: 70, usuario_id: 1 },
      ], total: 1, page: 1, size: 10, pages: 1 } })
    })
    api.patch.mockResolvedValue({ data: { id: 9, estado: 'ACTIVO' } })
    const { user } = await import('@testing-library/user-event').then(m => ({ user: m.default.setup() }))
    renderDash()
    await user.click(await screen.findByRole('button', { name: 'Aprobar aviso 9' }))
    expect(api.patch).toHaveBeenCalledWith('/api/admin/publicaciones/9', { estado: 'ACTIVO' }, expect.anything())
  })
})
