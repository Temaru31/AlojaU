import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import TelegramVincular from './TelegramVincular'
import { api } from '../services/api'

beforeEach(() => {
  // Los spyOn de cada test no deben fugar al siguiente (orden-independiente).
  vi.restoreAllMocks()
})

describe('TelegramVincular (M5 bot_url directo)', () => {
  it('botón pre-abre la pestaña en el gesto y navega ESA pestaña (la actual intacta)', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { bot_url: 'https://t.me/TestBot?start=abc.123' } })
    const ventana = { closed: false, location: {}, close: vi.fn() }
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ventana)
    render(<TelegramVincular token="t" vinculado={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/api/auth/telegram/vincular-inicio', {}, expect.anything()))
    // Pre-apertura en blanco dentro del gesto (anti-bloqueadores).
    expect(openSpy).toHaveBeenCalledWith('', '_blank', expect.anything())
    // La navegación cae sobre la pestaña nueva, jamás location.href.
    await waitFor(() => expect(ventana.location.href).toBe('https://t.me/TestBot?start=abc.123'))
    openSpy.mockRestore()
  })

  it('popup bloqueado: guía al enlace copiable sin navegar la página actual', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { bot_url: 'https://t.me/B?start=x' } })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    const hrefAntes = window.location.href
    render(<TelegramVincular token="t" vinculado={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
    expect(await screen.findByText(/bloqueó la ventana emergente/)).toBeInTheDocument()
    expect(window.location.href).toBe(hrefAntes)
    expect(screen.getByRole('link', { name: /https:\/\/t\.me\/B/ })).toHaveAttribute('href', 'https://t.me/B?start=x')
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
    // Bloque 1: reintentos con backoff (~6s) antes del aviso.
    expect(await screen.findByRole('alert', {}, { timeout: 9000 })).toHaveTextContent(/Aún no detectamos tu \/start/)
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

  it('bot_url inválida del backend muestra error y cierra la pre-apertura', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { bot_url: 'https://evil.com/x' } })
    const ventana = { closed: false, location: {}, close: vi.fn() }
    vi.spyOn(window, 'open').mockImplementation(() => ventana)
    const hrefAntes = window.location.href
    render(<TelegramVincular token="t" vinculado={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Respuesta inválida del bot/)
    expect(ventana.close).toHaveBeenCalled()
    expect(window.location.href).toBe(hrefAntes)
  })

  it('desvincular pide confirmación y libera (callback + toast)', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { desvinculado: true } })
    const onDesvinculado = vi.fn()
    render(<TelegramVincular token="t" vinculado telefonoVerificado onDesvinculado={onDesvinculado} />)
    fireEvent.click(screen.getByRole('button', { name: /Desvincular Telegram/ }))
    expect(screen.getByRole('dialog', { name: 'Desvincular Telegram' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desvincular y liberar' }))
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/api/auth/telegram/desvincular', {}, expect.anything()))
    expect(onDesvinculado).toHaveBeenCalled()
  })

  it('desvincular cancelado no llama al backend', () => {
    const postSpy = vi.spyOn(api, 'post')
    render(<TelegramVincular token="t" vinculado telefonoVerificado />)
    fireEvent.click(screen.getByRole('button', { name: /Desvincular Telegram/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(postSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin teléfono guardado la tarjeta se bloquea con guía (prerrequisito)', () => {
    render(<TelegramVincular token="t" vinculado={false} telefonoGuardado={false} />)
    expect(screen.getByText(/Ingresa y guarda tu número de WhatsApp/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abrir Bot en Telegram/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vincular cuenta' })).toBeDisabled()
  })

  it('verificado muestra badge verde con +20 pts', () => {
    render(<TelegramVincular token="t" vinculado telefonoVerificado />)
    expect(screen.getByText(/Teléfono y Telegram Verificados \(\+20 pts\)/)).toBeInTheDocument()
  })

  it('polling detecta la vinculación solo: toast + callback sin pulsar nada', async () => {
    vi.useFakeTimers()
    try {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { bot_url: 'https://t.me/B?start=x' } })
      vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false, location: {}, close: vi.fn() }))
      const getSpy = vi.spyOn(api, 'get')
        .mockResolvedValueOnce({ data: { telegram_vinculado: false } })
        .mockResolvedValue({ data: { telegram_vinculado: true } })
      const onVinculado = vi.fn()
      render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
      fireEvent.click(screen.getByRole('button', { name: /Abrir Bot en Telegram/ }))
      // Flush de la cadena abrirBot (post -> setBotAbierto -> monta polling).
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(postSpy).toHaveBeenCalled()
      // Dos ciclos: el 1º aún sin vincular, el 2º detecta y notifica.
      await act(async () => { await vi.advanceTimersByTimeAsync(6500) })
      expect(getSpy).toHaveBeenCalledWith('/api/auth/perfil', expect.anything())
      expect(onVinculado).toHaveBeenCalledWith(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('doble clic en Vincular no duplica el check (botón se deshabilita)', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: { telegram_vinculado: true } })
    const onVinculado = vi.fn()
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    const btn = screen.getByRole('button', { name: 'Vincular cuenta' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith(true))
    // 1 solo ciclo de comprobación aunque se pulse dos veces.
    expect(getSpy.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
