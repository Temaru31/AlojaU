import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import App from './App'

vi.mock('./services/api', () => ({ api: { get: vi.fn(), post: vi.fn() }, isCancelError: () => false }))

import { api } from './services/api'

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })

describe('App smoke honesto (shell + landing sin red)', () => {
  it('monta nav, landing Buscar y footer sin lanzar', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: [] })
      if (url === '/api/ciudades') return Promise.resolve({ data: [] })
      if (url === '/api/publicaciones') {
        return Promise.resolve({ data: { items: [], total: 0, page: 1, size: 9, pages: 1 } })
      }
      return Promise.resolve({ data: [] })
    })
    render(<App />)
    // Nav con marca accesible.
    expect(screen.getByLabelText('AlojaU inicio')).toBeInTheDocument()
    // Landing Buscar (hero eager, sin lazy).
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    // Footer estático.
    expect(screen.getByText(/Todos los derechos reservados/)).toBeInTheDocument()
  })

  it('R5 drawer móvil anónimo: login destacado, emojis y publicar full-width', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/publicaciones') {
        return Promise.resolve({ data: { items: [], total: 0, page: 1, size: 9, pages: 1 } })
      }
      return Promise.resolve({ data: [] })
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.getByRole('link', { name: /Iniciar sesión \/ Registrarse/ })).toHaveAttribute('href', '/perfil')
    expect(screen.getByRole('link', { name: '🔍 Buscar vivienda' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '🧡 Favoritos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Publicar vivienda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).not.toBeInTheDocument()
  })

  it('R5 drawer móvil autenticado: tarjeta usuario → /perfil y salir en rojo', async () => {
    localStorage.setItem('alojau_token', 'tok-u')
    api.get.mockImplementation((url) => {
      if (url === '/api/auth/perfil') {
        return Promise.resolve({ data: { email: 'ana@x.co', nombre_completo: 'Ana Ríos', rol: 'ESTUDIANTE', foto_perfil_url: 'https://x/f.jpg' } })
      }
      if (url === '/api/publicaciones') {
        return Promise.resolve({ data: { items: [], total: 0, page: 1, size: 9, pages: 1 } })
      }
      return Promise.resolve({ data: [] })
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const tarjeta = await screen.findByRole('link', { name: 'Abrir mi perfil' })
    expect(tarjeta).toHaveAttribute('href', '/perfil')
    expect(tarjeta).toHaveTextContent('Ana Ríos')
    expect(tarjeta).toHaveTextContent('ana@x.co')
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument()
  })
})
