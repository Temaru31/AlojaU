import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import OtpForm from './OtpForm'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

describe('OtpForm rutas de error honestas (M5 canal correcto)', () => {
  it('fallo de red al solicitar muestra alerta sin bloquear', async () => {
    api.post.mockRejectedValue({ response: { data: { detail: 'Sin servicio' } } })
    render(<OtpForm email="a@b.co" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin servicio')
  })

  it('código incompleto deja Verificar deshabilitado sin llamar api', () => {
    render(<OtpForm email="a@b.co" />)
    fireEvent.change(screen.getByLabelText(/6 dígitos/i), { target: { value: '123' } })
    expect(screen.getByRole('button', { name: /Confirmar código/ })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('verificación rechazada muestra detalle del backend', async () => {
    api.post.mockRejectedValue({ response: { data: { detail: 'Código inválido o expirado' } } })
    render(<OtpForm email="a@b.co" />)
    fireEvent.change(screen.getByLabelText(/6 dígitos/i), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar código/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Código inválido o expirado'))
  })
})
