import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HistorialAvisos, { infoEvento } from './HistorialAvisos'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: { get: vi.fn() },
  isCancelError: (e) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError',
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const HIST = {
  items: [
    { id: 10, publicacion_id: 3, titulo: 'Habitación Tulcán', evento: 'CREATED', detalle: 'x', creado_en: new Date(Date.now() - 3600_000).toISOString() },
    { id: 9, publicacion_id: 3, titulo: 'Habitación Tulcán', evento: 'APPROVED', detalle: 'x', creado_en: new Date(Date.now() - 7200_000).toISOString() },
    { id: 8, publicacion_id: 4, titulo: 'Otro aviso', evento: 'REJECTED', detalle: 'x', creado_en: null },
  ],
  total: 3,
}

describe('infoEvento', () => {
  it('traduce eventos a lenguaje humano y no rompe con desconocidos', () => {
    expect(infoEvento('APPROVED').etiqueta).toBe('Aprobado: ya visible')
    expect(infoEvento('REJECTED').etiqueta).toBe('No aprobado')
    expect(infoEvento('CREATED').etiqueta).toBe('Aviso creado')
    expect(infoEvento('RARO_X').etiqueta).toBe('RARO_X')
  })
})

describe('HistorialAvisos', () => {
  it('sin token no renderiza nada ni llama a la API', () => {
    const { container } = render(<MemoryRouter><HistorialAvisos token="" /></MemoryRouter>)
    expect(container).toBeEmptyDOMElement()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('cerrado por defecto (lazy): abre y muestra la trazabilidad humana', async () => {
    api.get.mockResolvedValue({ data: HIST })
    render(<MemoryRouter><HistorialAvisos token="t" /></MemoryRouter>)
    expect(api.get).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Actividad reciente/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/publicaciones/mias/historial',
      expect.objectContaining({ params: { size: 10 } }),
    ))
    expect(await screen.findByText('Aviso creado')).toBeInTheDocument()
    expect(screen.getByText('Aprobado: ya visible')).toBeInTheDocument()
    expect(screen.getByText('No aprobado')).toBeInTheDocument()
    // Títulos con enlace al aviso.
    const links = screen.getAllByRole('link', { name: 'Habitación Tulcán' })
    expect(links[0]).toHaveAttribute('href', '/publicacion/3')
    // Sin enums crudos.
    expect(screen.queryByText('CREATED')).not.toBeInTheDocument()
    expect(screen.queryByText('APPROVED')).not.toBeInTheDocument()
  })

  it('vacío y error tienen mensajes accionables', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } })
    render(<MemoryRouter><HistorialAvisos token="t" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Actividad reciente/ }))
    expect(await screen.findByText(/Sin actividad todavía/)).toBeInTheDocument()
    cleanup()
    api.get.mockRejectedValue({ response: { status: 500 } })
    render(<MemoryRouter><HistorialAvisos token="t" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Actividad reciente/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cargar/)
    api.get.mockResolvedValue({ data: HIST })
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Aviso creado')).toBeInTheDocument()
  })
})
