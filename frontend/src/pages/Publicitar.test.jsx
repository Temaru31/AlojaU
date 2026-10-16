import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Publicitar from './Publicitar'
import { getPlanesPublicidad, destacarPublicacion, getMisDestacados, api } from '../services/api'
import * as Auth from '../contexts/AuthContext'

vi.mock('../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getPlanesPublicidad: vi.fn(),
  destacarPublicacion: vi.fn(),
  getMisDestacados: vi.fn(),
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const PLANES = [
  { id: 1, nombre: 'Básico 7 días', dias: 7, precio_cop: 15000, prioridad: 1, activo: true },
  { id: 2, nombre: 'Plus 15 días', dias: 15, precio_cop: 25000, prioridad: 2, activo: true },
  { id: 3, nombre: 'Premium 30 días', dias: 30, precio_cop: 40000, prioridad: 3, activo: true },
]

const renderPage = (entries = ['/publicitar?publicacion_id=5']) => {
  vi.spyOn(Auth, 'useAuth').mockReturnValue({
    token: 'tok-arr', user: { email: 'arr@alojau.com', rol: 'ARRENDADOR' },
    loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
  })
  getPlanesPublicidad.mockResolvedValue({ data: PLANES })
  getMisDestacados.mockResolvedValue({ data: [] })
  api.get.mockResolvedValue({ data: { items: [{ id: 5, titulo: 'Habitación Tulcán', estado: 'ACTIVO' }], total: 1 } })
  return render(<MemoryRouter initialEntries={entries}><Publicitar /></MemoryRouter>)
}

describe('Publicitar - flujo destacar aviso (publicidad v1)', () => {
  it('lista los 3 planes y permite elegir el de 7 días', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Básico 7 días/)).toBeInTheDocument())
    expect(screen.getByText(/Plus 15 días/)).toBeInTheDocument()
    expect(screen.getByText(/Premium 30 días/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /7 días/ }))
    expect(screen.getByRole('radio', { name: /7 días/ })).toBeChecked()
  })

  it('al confirmar con plan 7d llama POST destacar con publicacion_id, plan_id y pago_ref', async () => {
    destacarPublicacion.mockResolvedValue({ data: { id: 9, estado: 'PENDIENTE' } })
    renderPage()
    await waitFor(() => expect(screen.getByText(/Básico 7 días/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: /7 días/ }))
    fireEvent.change(screen.getByPlaceholderText(/NEQUI-123456/), { target: { value: 'NEQUI-123' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar destacado/i }))
    await waitFor(() => expect(destacarPublicacion).toHaveBeenCalledWith(
      { publicacion_id: 5, plan_id: 1, pago_ref: 'NEQUI-123' },
      'tok-arr',
    ))
    expect(await screen.findByRole('status')).toHaveTextContent(/pendiente de aprobación/i)
  })

  it('sin sesión pide iniciar sesión', () => {
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: '', user: null, loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><Publicitar /></MemoryRouter>)
    expect(screen.getByText(/inicia sesión/i)).toBeInTheDocument()
  })
})
