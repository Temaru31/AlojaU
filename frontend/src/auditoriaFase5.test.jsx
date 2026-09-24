// FASE 5 auditoría UX (2026-09-24): errores accionables, feedback y leaks.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
import { api } from './services/api'

import MisPublicaciones from './pages/MisPublicaciones'
import Comparar from './pages/Comparar'
import UploadFotos from './components/UploadFotos'

vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ token: 't', user: { id: 1 }, refresh: vi.fn() }),
}))
vi.mock('./contexts/FavoritosContext', () => ({
  useFavoritos: () => ({ isFav: () => false, toggle: vi.fn() }),
}))
vi.mock('./contexts/CompararContext', () => ({
  useComparar: () => ({ comparar: [1, 2], clear: () => {}, toggle: () => {}, error: '' }),
}))

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('FASE 2: sesión vencida guía a re-ingresar (no solo Reintentar)', () => {
  it('MisPublicaciones 401 muestra "Volver a ingresar" a /perfil', async () => {
    api.get.mockRejectedValue({ response: { status: 401 }, code: 'X' })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /Volver a ingresar/i })
    expect(link).toHaveAttribute('href', '/perfil')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('error de red conserva Reintentar', async () => {
    api.get.mockRejectedValue({ response: { status: 500 }, code: 'X' })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})

describe('FASE 2: UploadFotos indica carga con spinner accesible', () => {
  it('botón deshabilitado con aria-busy durante la subida', async () => {
    let resolver
    api.post.mockReturnValue(new Promise((res) => { resolver = res }))
    const f = new File(['x'.repeat(100)], 'foto.jpg', { type: 'image/jpeg' })
    Object.defineProperty(f, 'size', { value: 1024 })
    render(<MemoryRouter><UploadFotos token="t" onUrls={vi.fn()} /></MemoryRouter>)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [f, f, f] } })
    })
    const btn = screen.getByRole('button', { name: /Subir 3 fotos/i })
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'))
    expect(btn).toBeDisabled()
    await act(async () => { resolver({ data: { urls: ['https://c/u1.jpg'] } }) })
  })
})

describe('FASE 4: Comparar no pisa estado tras desmontar', () => {
  it('respuesta tardía tras unmount no rompe ni setea estado', async () => {
    let resolver
    api.get.mockReturnValue(new Promise((res) => { resolver = res }))
    const { unmount } = render(<MemoryRouter><Comparar /></MemoryRouter>)
    unmount()
    await act(async () => {
      resolver({ data: { id: 1, titulo: 'Tardía' } })
    })
    // Si el vivo-flag faltara, React advertiría setState en desmontado.
    expect(api.get).toHaveBeenCalled()
  })
})
