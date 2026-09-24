// M5: el callback respeta el destino post-login (ej. /publicar).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import AuthCallback from './AuthCallback'
import { api } from '../services/api'
import { POST_LOGIN_REDIRECT_KEY } from '../services/supabaseClient'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

const jwtFake = (payload) => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'none' })}.${b64(payload)}.firma`
}

function renderEn(destino, hash) {
  window.location.hash = hash
  let vista = ''
  const Espia = () => {
    vista = useLocation().pathname
    return null
  }
  render(
    <MemoryRouter initialEntries={[destino]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Espia />} />
      </Routes>
    </MemoryRouter>,
  )
  return () => vista
}

afterEach(() => {
  window.location.hash = ''
  sessionStorage.clear()
  localStorage.clear()
})
beforeEach(() => vi.clearAllMocks())

describe('AuthCallback retorno post-login (M5)', () => {
  it('vuelve a /publicar si se guardó redirect', async () => {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, '/publicar')
    const tok = jwtFake({ email: 'g@x.co', sub: 'sup-1' })
    api.post.mockResolvedValue({ data: { access_token: 'tok', es_nuevo: false } })
    const verVista = renderEn('/auth/callback', `#access_token=${tok}`)
    await screen.findByText(/Bienvenido de nuevo/i)
    await waitFor(() => expect(verVista()).toBe('/publicar'), { timeout: 3000 })
    expect(localStorage.getItem('alojau_token')).toBe('tok')
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull()
  })

  it('sin redirect va al inicio', async () => {
    const tok = jwtFake({ email: 'g@x.co', sub: 'sup-1' })
    api.post.mockResolvedValue({ data: { access_token: 'tok', es_nuevo: true } })
    const verVista = renderEn('/auth/callback', `#access_token=${tok}`)
    await screen.findByText(/Cuenta creada/i)
    await waitFor(() => expect(verVista()).toBe('/'), { timeout: 3000 })
  })

  it('error de Google muestra detalle y salida a perfil', async () => {
    renderEn('/auth/callback', '#error=access_denied&error_description=denegado')
    expect(await screen.findByText(/No se pudo completar/)).toBeInTheDocument()
    expect(screen.getByText(/denegado/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mi Perfil/ })).toHaveAttribute('href', '/perfil')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sin credenciales de Google pide revisar configuración', async () => {
    renderEn('/auth/callback', '')
    expect(await screen.findByText(/sin token ni código/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('fallo de vinculación en backend muestra mensaje y no guarda token', async () => {
    const tok = jwtFake({ email: 'g@x.co', sub: 'sup-1' })
    api.post.mockRejectedValue({ response: { data: { detail: 'Email ya registrado' } } })
    renderEn('/auth/callback', `#access_token=${tok}`)
    expect(await screen.findByText(/Email ya registrado/)).toBeInTheDocument()
    expect(localStorage.getItem('alojau_token')).toBeNull()
  })

  it('redirect malicioso se ignora (open-redirect)', async () => {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, 'https://evil.com/x')
    const tok = jwtFake({ email: 'g@x.co', sub: 'sup-1' })
    api.post.mockResolvedValue({ data: { access_token: 'tok' } })
    const verVista = renderEn('/auth/callback', `#access_token=${tok}`)
    await screen.findByText(/Bienvenido de nuevo/i)
    await waitFor(() => expect(verVista()).toBe('/'), { timeout: 3000 })
  })
})
