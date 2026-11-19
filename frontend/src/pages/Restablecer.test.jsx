import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Restablecer from './Restablecer'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => vi.clearAllMocks())

const renderPage = (qs = '?email=a%40b.co&token=t123') => render(
  <MemoryRouter initialEntries={[`/restablecer${qs}`]}><Restablecer /></MemoryRouter>,
)

describe('Restablecer (fortaleza v13 + un solo uso)', () => {
  it('botón bloqueado hasta contraseña válida y coincidente', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Restablecer contraseña/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'Corta1!' } })
    fireEvent.change(screen.getByLabelText(/Confirma la contraseña/), { target: { value: 'Corta1!' } })
    expect(screen.getByRole('button', { name: /Restablecer contraseña/ })).toBeDisabled()
  })

  it('avisa cuando no coinciden', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'Segura1!x' } })
    fireEvent.change(screen.getByLabelText(/Confirma la contraseña/), { target: { value: 'Otra1!x' } })
    expect(screen.getByText(/no coinciden/)).toBeInTheDocument()
  })

  it('éxito confirma revocación de sesiones y navega a perfil', async () => {
    api.post.mockResolvedValue({ data: { mensaje: 'ok' } })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'Segura1!x' } })
    fireEvent.change(screen.getByLabelText(/Confirma la contraseña/), { target: { value: 'Segura1!x' } })
    fireEvent.click(screen.getByRole('button', { name: /Restablecer contraseña/ }))
    expect(await screen.findByText(/sesiones anteriores fueron revocadas/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/auth/recovery/confirmar', {
      email: 'a@b.co', token: 't123', nueva_password: 'Segura1!x',
    })
  })

  it('enlace usado muestra error accionable', async () => {
    api.post.mockRejectedValue({ response: { data: { detail: 'Enlace inválido' } } })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'Segura1!x' } })
    fireEvent.change(screen.getByLabelText(/Confirma la contraseña/), { target: { value: 'Segura1!x' } })
    fireEvent.click(screen.getByRole('button', { name: /Restablecer contraseña/ }))
    expect(await screen.findByText(/Enlace inválido/)).toBeInTheDocument()
  })
})
