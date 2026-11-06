import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Recuperar from './Recuperar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const renderPage = () => render(<MemoryRouter><Recuperar /></MemoryRouter>)

describe('Recuperar (enlace 15 min, un solo uso)', () => {
  it('éxito muestra mensaje genérico anti-enumeración', async () => {
    api.post.mockResolvedValue({ data: { mensaje: 'Si el correo existe...' } })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Correo de tu cuenta/), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }))
    expect(await screen.findByText(/Si el correo existe/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/auth/recovery/solicitar', { email: 'a@b.co' })
  })

  it('dev_token expone atajo a restablecer solo en dev', async () => {
    api.post.mockResolvedValue({ data: { mensaje: 'ok', dev_token: 'tok123' } })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Correo de tu cuenta/), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }))
    const link = await screen.findByRole('link', { name: /restablecer con este enlace/ })
    expect(link.getAttribute('href')).toContain('/restablecer?')
    expect(link.getAttribute('href')).toContain('token=tok123')
  })

  it('error muestra alerta sin exponer detalle interno', async () => {
    api.post.mockRejectedValue({ response: { data: {} } })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Correo de tu cuenta/), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }))
    expect(await screen.findByText(/No se pudo procesar/)).toBeInTheDocument()
  })
})
