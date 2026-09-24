// M3: transparencia de canal OTP (email vs Telegram).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import OtpForm from './OtpForm'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

describe('OtpForm canal explícito (M3)', () => {
  it('canal email: mensaje nombra el correo y 10 minutos', async () => {
    api.post.mockResolvedValue({ data: { canal: 'email' } })
    render(<OtpForm email="a@b.co" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
    expect(await screen.findByText(/correo electrónico registrado.*10 minutos/i)).toBeInTheDocument()
  })

  it('canal telegram: mensaje nombra el Bot oficial', async () => {
    api.post.mockResolvedValue({ data: { canal: 'telegram' } })
    render(<OtpForm email="a@b.co" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
    expect(await screen.findByText(/Bot oficial de Telegram.*10 minutos/i)).toBeInTheDocument()
  })

  it('sin canal (backend viejo): fallback a correo', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<OtpForm email="a@b.co" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
    expect(await screen.findByText(/correo electrónico registrado/i)).toBeInTheDocument()
  })

  it('tras enviar, bloquea reenvío 60s (anti-spam)', async () => {
    api.post.mockResolvedValue({ data: { canal: 'email' } })
    render(<OtpForm email="a@b.co" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
    const reenviar = await screen.findByRole('button', { name: /Reenviar en 60s/ })
    expect(reenviar).toBeDisabled()
    fireEvent.click(reenviar)
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('código correcto muestra ✓ y llama onVerificado', async () => {
    api.post.mockResolvedValue({ data: { email_verificado: true } })
    const onVerificado = vi.fn()
    render(<OtpForm email="a@b.co" onVerificado={onVerificado} />)
    fireEvent.change(screen.getByLabelText(/6 dígitos/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    expect(await screen.findByText(/✓.*Correo verificado/i)).toBeInTheDocument()
    expect(onVerificado).toHaveBeenCalled()
  })
})
