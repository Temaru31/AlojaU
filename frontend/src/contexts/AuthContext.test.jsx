import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { AuthProvider, useAuth, inicialesDe, limpiarSesionLocal, SESION_KEYS } from './AuthContext'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

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

describe('AuthContext M1 (cierre total anti-fantasma)', () => {
  it('limpiarSesionLocal borra sesión y nada ajeno (ni otro redirect)', () => {
    for (const k of SESION_KEYS) localStorage.setItem(k, 'x')
    localStorage.setItem('otra_app_clave', ' intacta ')
    sessionStorage.setItem('alojau_post_login_redirect', '/publicar')
    sessionStorage.setItem('tmp', '1')
    limpiarSesionLocal()
    for (const k of SESION_KEYS) expect(localStorage.getItem(k)).toBeNull()
    expect(localStorage.getItem('otra_app_clave')).toBe(' intacta ')
    expect(sessionStorage.getItem('alojau_post_login_redirect')).toBeNull()
    expect(sessionStorage.getItem('tmp')).toBe('1')
  })

  it('logout revoca en BD, limpia todo, anula usuario y reemplaza ruta', async () => {
    localStorage.setItem('alojau_token', 'tok-salir')
    localStorage.setItem('favoritos', '[1]')
    localStorage.setItem('alojau_comparar', '[2]')
    api.get.mockResolvedValue({ data: { email: 'a@b.co', rol: 'ARRENDADOR' } })
    api.post.mockResolvedValue({ data: { revocadas: 1 } })
    const replaceSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { replace: replaceSpy }, writable: true })

    const Btn = () => {
      const { logout, user } = useAuth()
      return (
        <>
          <span data-testid="u">{user ? user.email : 'anonimo'}</span>
          <button type="button" onClick={() => logout()}>salir</button>
        </>
      )
    }
    render(<AuthProvider><Btn /></AuthProvider>)
    await screen.findByText('a@b.co')
    await act(async () => { fireEvent.click(screen.getByText('salir')) })
    expect(api.post).toHaveBeenCalledWith('/api/auth/logout', {}, {
      headers: { Authorization: 'Bearer tok-salir' },
    })
    for (const k of SESION_KEYS) expect(localStorage.getItem(k)).toBeNull()
    expect(await screen.findByTestId('u')).toHaveTextContent('anonimo')
    expect(replaceSpy).toHaveBeenCalledWith('/')
  })

  it('logout sin red igual limpia el estado local (best-effort)', async () => {
    localStorage.setItem('alojau_token', 'tok-x')
    api.get.mockResolvedValue({ data: { email: 'a@b.co' } })
    api.post.mockRejectedValue(new Error('red caída'))
    Object.defineProperty(window, 'location', { value: { replace: vi.fn() }, writable: true })
    const Btn = () => {
      const { logout, user } = useAuth()
      return (
        <>
          <span data-testid="u2">{user ? 'hay' : 'anonimo'}</span>
          <button type="button" onClick={() => logout()}>salir</button>
        </>
      )
    }
    render(<AuthProvider><Btn /></AuthProvider>)
    await screen.findByText('hay')
    await act(async () => { fireEvent.click(screen.getByText('salir')) })
    expect(localStorage.getItem('alojau_token')).toBeNull()
    expect(await screen.findByTestId('u2')).toHaveTextContent('anonimo')
  })
})

describe('AuthContext v14.1 (memoización)', () => {
  it('value y refresh estables entre renders sin cambio de estado', async () => {
    let first = null
    let last = null
    const Cap = () => {
      const v = useAuth()
      if (!first) first = v
      last = v
      return <span data-testid="listo">ok</span>
    }
    const { rerender } = render(<AuthProvider><Cap /></AuthProvider>)
    await screen.findByTestId('listo')
    rerender(<AuthProvider><Cap /></AuthProvider>)
    await screen.findByTestId('listo')
    expect(last.refresh).toBe(first.refresh)
    expect(last).toBe(first)
  })
})
