import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReportarModal from '../components/ReportarModal'
import AdminReportes from '../pages/AdminReportes'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn(), get: vi.fn(), patch: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const renderModal = () => render(
  <ReportarModal publicacionId={1} titulo="Apto test" onClose={vi.fn()} />
)
const renderAdmin = () => render(
  <MemoryRouter><AdminReportes /></MemoryRouter>
)

describe('T1 Reportes frontend', () => {
  it('modal renderiza motivo + detalle + enviar', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Reportar aviso' })).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument()
    expect(screen.getByLabelText(/Detalle/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar anónimo' })).toBeInTheDocument()
  })

  it('envía publicacion_id + motivo + toast éxito', async () => {
    api.post.mockResolvedValue({ data: { id: 9, estado: 'PENDIENTE' } })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anónimo' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/reportes', {
      publicacion_id: 1,
      motivo: 'DATOS_FALSOS',
      detalle: undefined,
    }))
    expect(await screen.findByText(/Gracias, revisaremos/)).toBeInTheDocument()
  })

  it('modal cierra con tecla Escape (accesibilidad)', async () => {
    const onClose = vi.fn()
    render(<ReportarModal publicacionId={1} titulo="Apto test" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Reportar aviso' })).toBeInTheDocument()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('muestra mensaje anti-spam claro en 429', async () => {
    api.post.mockRejectedValue({ response: { status: 429 } })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anónimo' }))
    expect(await screen.findByText(/Espera 1 minuto/)).toBeInTheDocument()
  })

  it('bandeja admin lista pendientes y confirma', async () => {
    api.get.mockResolvedValue({ data: [{ id: 5, publicacion_id: 1, motivo: 'OTRO', detalle: 'x', estado: 'PENDIENTE', fecha_creacion: null, usuario_id: null }] })
    api.patch.mockResolvedValue({ data: { id: 5, estado: 'CONFIRMADO' } })
    renderAdmin()
    expect(await screen.findByText(/ver aviso #1/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar reporte 5/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/reportes/5', { accion: 'confirmar' }, expect.anything()))
  })

  it('bandeja muestra aviso de permiso en 403', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    renderAdmin()
    expect(await screen.findByText(/Solo administradores/)).toBeInTheDocument()
  })
})
