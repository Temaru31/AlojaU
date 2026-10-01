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
    expect(screen.getByRole('link', { name: '🔔 Mis Alertas y Notificaciones' })).toHaveAttribute('href', '/alertas')
    expect(screen.getByRole('link', { name: '+ Publicar vivienda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).not.toBeInTheDocument()
  })

  it('dropdown escritorio armonizado: tarjeta, emojis y foto', async () => {
    localStorage.setItem('alojau_token', 'tok-u')
    api.get.mockImplementation((url) => {
      if (url === '/api/auth/perfil') {
        return Promise.resolve({ data: { email: 'ana@x.co', nombre_completo: 'Ana Ríos', rol: 'ARRENDADOR', foto_perfil_url: 'https://x/f.jpg' } })
      }
      if (url === '/api/publicaciones') {
        return Promise.resolve({ data: { items: [], total: 0, page: 1, size: 9, pages: 1 } })
      }
      return Promise.resolve({ data: [] })
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(await screen.findByRole('button', { name: 'Menú de usuario' }))
    // Dentro del menú desktop el rol es menuitem (en el drawer móvil es link).
    const tarjeta = await screen.findByRole('menuitem', { name: 'Abrir mi perfil' })
    expect(tarjeta).toHaveAttribute('href', '/perfil')
    expect(tarjeta).toHaveTextContent('Ana Ríos')
    expect(tarjeta).toHaveTextContent('Arrendador')
    expect(screen.getByRole('menuitem', { name: /Mis Publicaciones/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Favoritos/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Cerrar sesión/ })).toBeInTheDocument()
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

describe('Nav Mis publicaciones dinámico (0 pubs oculto, 1+ visible)', () => {
  const perfil = { email: 'base@x.co', nombre_completo: 'Base Cero', rol: 'ESTUDIANTE' }
  const mockConMias = (total) => (url) => {
    if (url === '/api/auth/perfil') return Promise.resolve({ data: perfil })
    if (url === '/api/publicaciones/mias') {
      return Promise.resolve({ data: { items: [], total, page: 1, size: 1, pages: 1 } })
    }
    if (url === '/api/publicaciones') {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, size: 9, pages: 1 } })
    }
    return Promise.resolve({ data: [] })
  }

  it('Usuario Base con 0 avisos: sin Mis publicaciones pero con + Publicar', async () => {
    localStorage.setItem('alojau_token', 'tok-base')
    api.get.mockImplementation(mockConMias(0))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/publicaciones/mias', expect.objectContaining({ params: { size: 1 } }),
    ))
    expect(screen.queryByRole('link', { name: 'Mis publicaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Mis Publicaciones/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.queryByRole('link', { name: '📢 Mis Publicaciones' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Publicar vivienda' })).toBeInTheDocument()
  })

  it('tras la primera publicación el enlace aparece sin recargar', async () => {
    localStorage.setItem('alojau_token', 'tok-base')
    let total = 0
    api.get.mockImplementation((url, config) => mockConMias(total)(url, config))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Mis publicaciones' })).not.toBeInTheDocument())
    total = 1
    window.dispatchEvent(new Event('alojau:mias-change'))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mis publicaciones' })).toHaveAttribute('href', '/mis-publicaciones'))
  })

  it('anónimo: sin Mis publicaciones en móvil pero con + Publicar', async () => {
    api.get.mockImplementation(mockConMias(0))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.queryByRole('link', { name: '📢 Mis Publicaciones' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Publicar vivienda' })).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(
      '/api/publicaciones/mias', expect.anything(),
    )
  })
})
