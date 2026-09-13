import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth, inicialesDe } from './AuthContext'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))

afterEach(() => {
  cleanup()
  localStorage.clear()
})
beforeEach(() => vi.clearAllMocks())

const Probe = () => {
  const { token, user, loading } = useAuth()
  return (
    <div>
      <span data-testid="token">{token || 'sin-token'}</span>
      <span data-testid="user">{user ? user.email : 'anonimo'}</span>
      <span data-testid="loading">{loading ? 'cargando' : 'listo'}</span>
    </div>
  )
}

describe('AuthContext', () => {
  it('sin token: sesión anónima sin llamar al backend', () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('token')).toHaveTextContent('sin-token')
    expect(screen.getByTestId('user')).toHaveTextContent('anonimo')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('con token: valida perfil y expone usuario', async () => {
    localStorage.setItem('alojau_token', 'tok-123')
    api.get.mockResolvedValue({ data: { email: 'arrendador@alojau.com', nombre_completo: 'Arrendador Demo', rol: 'ARRENDADOR' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/auth/perfil', {
      headers: { Authorization: 'Bearer tok-123' },
    }))
    expect(await screen.findByText('arrendador@alojau.com')).toBeInTheDocument()
  })

  it('token inválido (401): limpia sesión solo', async () => {
    localStorage.setItem('alojau_token', 'tok-malo')
    api.get.mockRejectedValue({ response: { status: 401 } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anonimo'))
    expect(localStorage.getItem('alojau_token')).toBeNull()
  })

  it('inicialesDe: nombre, email y vacío', () => {
    expect(inicialesDe({ nombre_completo: 'María José' })).toBe('MJ')
    expect(inicialesDe({ email: 'arrendador@alojau.com' })).toBe('AR')
    expect(inicialesDe(null)).toBe('?')
    expect(inicialesDe({})).toBe('?')
  })
})
