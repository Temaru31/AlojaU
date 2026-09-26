import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TelegramVincular from './TelegramVincular'
import { api } from '../services/api'

describe('TelegramVincular (M5 bot_url directo)', () => {
  it('botón consume bot_url del endpoint (sin construirlo en frontend)', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { bot_url: 'https://t.me/TestBot?start=abc.123' } })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<TelegramVincular token="t" vinculado={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/api/auth/telegram/vincular-inicio', {}, expect.anything()))
    expect(openSpy).toHaveBeenCalledWith('https://t.me/TestBot?start=abc.123', '_blank', expect.anything())
    openSpy.mockRestore()
  })

  it('vinculado muestra badge y no ofrece abrir', () => {
    render(<TelegramVincular token="t" vinculado />)
    expect(screen.getByText(/Vinculado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Abrir Bot/ })).not.toBeInTheDocument()
  })

  it('paso 3 Vincular cuenta confirma contra el perfil real', async () => {
    const onVinculado = vi.fn()
    vi.spyOn(api, 'get').mockResolvedValue({ data: { telegram_vinculado: true } })
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    expect(screen.getByText(/presiona el botón/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith(true))
  })

  it('paso 3 sin /start previo avisa sin vincular', async () => {
    const onVinculado = vi.fn()
    vi.spyOn(api, 'get').mockResolvedValue({ data: { telegram_vinculado: false } })
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Aún no detectamos tu \/start/)
    expect(onVinculado).not.toHaveBeenCalled()
  })

  it('F5 503 abre modo local simulado que jamás vincula de verdad', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 503, data: { detail: 'Telegram no configurado' } } })
    render(<TelegramVincular token="t" vinculado={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
    expect(await screen.findByText(/Modo de pruebas local detectado/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Código simulado de 6 dígitos'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Probar' }))
    expect(await screen.findByText(/Flujo simulado correcto/)).toBeInTheDocument()
    expect(screen.queryByText(/Vinculado/)).not.toBeInTheDocument()
  })
})
