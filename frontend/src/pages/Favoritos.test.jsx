import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Favoritos from './Favoritos'
import { api } from '../services/api'
import { FavoritosProvider } from '../contexts/FavoritosContext'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../components/Card', () => ({ default: ({ pub }) => <div data-testid={`card-${pub.id}`}>{pub.titulo}</div> }))

const favIds = [1, 2]

function renderFav(ids) {
  try { localStorage.setItem('alojau_favoritos', JSON.stringify(ids)) } catch { /* noop */ }
  return render(
    <MemoryRouter initialEntries={['/favoritos']}>
      <FavoritosProvider>
        <Favoritos />
      </FavoritosProvider>
    </MemoryRouter>
  )
}

afterEach(() => { cleanup(); localStorage.clear() })
beforeEach(() => vi.clearAllMocks())

describe('Favoritos P-02', () => {
  it('vacío muestra CTA a buscar', async () => {
    renderFav([])
    await waitFor(() => expect(screen.getByText(/Aún no guardas nada/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Ir a buscar vivienda/ })).toBeInTheDocument()
  })

  it('carga detalles de cada favorito y marca fallidos', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/publicaciones/1') return Promise.resolve({ data: { id: 1, titulo: 'Aviso uno' } })
      return Promise.reject({ response: { status: 404 } })
    })
    renderFav(favIds)
    await waitFor(() => expect(screen.getByTestId('card-1')).toBeInTheDocument())
    expect(screen.getByText(/ya no disponible/)).toBeInTheDocument()
    expect(screen.getByText(/ID 2/)).toBeInTheDocument()
  })

  it('muestra contador y botón limpiar', async () => {
    api.get.mockResolvedValue({ data: { id: 1, titulo: 'Aviso uno' } })
    renderFav([1])
    await waitFor(() => expect(screen.getByText(/1 guardado/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Limpiar todos/ })).toBeInTheDocument()
  })
})
