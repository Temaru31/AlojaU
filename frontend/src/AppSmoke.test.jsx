import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
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
})
