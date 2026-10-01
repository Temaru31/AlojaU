import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Campanita from './Campanita'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))

const BANDEJA = {
  items: [
    { id: 1, tipo: 'nuevo_arriendo', titulo: 'Aviso centro', cuerpo: '$500.000', publicacion_id: 7, leida: false, created_at: new Date().toISOString() },
    { id: 2, tipo: 'moderacion', titulo: 'Revisado', cuerpo: '', publicacion_id: null, leida: true, created_at: new Date().toISOString() },
  ],
  total: 2, no_leidas: 1, page: 1, size: 20, pages: 1,
}

function renderEn(ruta = '/') {
  const Espia = () => {
    const { pathname } = useLocation()
    return <p data-testid="vista">{pathname}</p>
  }
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Campanita token="t" />
      <Routes>
        <Route path="/publicacion/:id" element={<Espia />} />
        <Route path="/alertas" element={<Espia />} />
        <Route path="*" element={<Espia />} />
      </Routes>
    </MemoryRouter>,
  )
  return () => screen.getByTestId('vista').textContent
}

afterEach(() => { cleanup(); localStorage.clear() })
beforeEach(() => vi.clearAllMocks())

describe('Campanita (Fase 3)', () => {
  it('sin token no renderiza nada ni pide la bandeja', () => {
    const { container } = render(<MemoryRouter><Campanita token="" /></MemoryRouter>)
    expect(container).toBeEmptyDOMElement()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('badge con no_leídas y dropdown con avisos', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    renderEn()
    expect(await screen.findByRole('button', { name: /Notificaciones, 1 sin leer/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(await screen.findByText('Aviso centro')).toBeInTheDocument()
    expect(screen.getByText('Revisado')).toBeInTheDocument()
  })

  it('sin no leídas no hay badge ni Marcar todas', async () => {
    api.get.mockResolvedValue({ data: { ...BANDEJA, items: [], total: 0, no_leidas: 0 } })
    renderEn()
    const btn = await screen.findByRole('button', { name: 'Notificaciones' })
    expect(btn.textContent).not.toMatch(/\d/)
    fireEvent.click(btn)
    expect(await screen.findByText(/Sin notificaciones/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar todas/ })).not.toBeInTheDocument()
  })

  it('clic en aviso marca leída y navega al detalle', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    api.patch.mockResolvedValue({ data: {} })
    const verVista = renderEn()
    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }))
    fireEvent.click(await screen.findByText('Aviso centro'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/notificaciones/1/leer', {}, expect.anything()))
    await waitFor(() => expect(verVista()).toBe('/publicacion/7'))
  })

  it('aviso sin publicación solo marca (no navega)', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    api.patch.mockResolvedValue({ data: {} })
    const verVista = renderEn('/perfil')
    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }))
    fireEvent.click(await screen.findByText('Revisado'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/notificaciones/2/leer', {}, expect.anything()))
    expect(verVista()).toBe('/perfil')
  })

  it('Marcar todas limpia el badge', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    api.patch.mockResolvedValue({ data: { actualizadas: 1 } })
    renderEn()
    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Marcar todas/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/notificaciones/leer-todas', {}, expect.anything()))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument())
  })

  it('Escape cierra el panel', async () => {
    api.get.mockResolvedValue({ data: BANDEJA })
    renderEn()
    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }))
    expect(await screen.findByText('Aviso centro')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Aviso centro')).not.toBeInTheDocument())
  })
})
