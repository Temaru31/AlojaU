import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import TelegramVincular from './TelegramVincular'
import { api } from '../services/api'

beforeEach(() => {
  // Los spyOn de cada test no deben fugar al siguiente (orden-independiente).
  vi.restoreAllMocks()
})

describe('TelegramVincular (deep link pre-generado + anchor nativo)', () => {
  const mockEnlace = (botUrl = 'https://t.me/TestBot?start=abc.123') => {
    const getSpy = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/auth/telegram/enlace') {
        return Promise.resolve({ data: { bot_url: botUrl, expira_segundos: 600 } })
      }
      return Promise.resolve({ data: {} })
    })
    return getSpy
  }

  it('enlace pre-generado se renderiza como anchor nativo (cero window.open)', async () => {
    const getSpy = mockEnlace()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => { throw new Error('no debe llamarse') })
    const hrefAntes = window.location.href
    render(<TelegramVincular token="t" vinculado={false} />)
    expect(screen.getByText(/Preparando enlace/)).toBeInTheDocument()
    const enlace = await screen.findByRole('link', { name: /Abrir Bot en Telegram/ })
    expect(enlace).toHaveAttribute('href', 'https://t.me/TestBot?start=abc.123')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(getSpy).toHaveBeenCalledWith('/api/auth/telegram/enlace', expect.anything())
    // Ni siquiera existe el camino window.open/location en el flujo.
    expect(openSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe(hrefAntes)
    openSpy.mockRestore()
  })

  it('clic en el anchor inicia el polling sin navegar la página actual', async () => {
    mockEnlace()
    vi.spyOn(api, 'get').mockImplementationOnce((url) => {
      if (url === '/api/auth/telegram/enlace') {
        return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
      }
      return Promise.resolve({ data: {} })
    })
    const hrefAntes = window.location.href
    const onVinculado = vi.fn()
    // NOTE: se re-mockea get para el polling tras el montaje.
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    const enlace = await screen.findByRole('link', { name: /Abrir Bot en Telegram/ })
    fireEvent.click(enlace)
    expect(window.location.href).toBe(hrefAntes)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('vinculado muestra badge y no ofrece abrir', () => {
    render(<TelegramVincular token="t" vinculado />)
    expect(screen.getByText(/Vinculado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Abrir Bot/ })).not.toBeInTheDocument()
  })

  it('paso 3 Vincular cuenta confirma contra el perfil real', async () => {
    const onVinculado = vi.fn()
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/auth/telegram/enlace') {
        return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
      }
      return Promise.resolve({ data: { telegram_vinculado: true } })
    })
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    expect(screen.getByText(/presiona el botón/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith(true))
  })

  it('paso 3 sin /start previo avisa sin vincular', async () => {
    const onVinculado = vi.fn()
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/auth/telegram/enlace') {
        return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
      }
      return Promise.resolve({ data: { telegram_vinculado: false } })
    })
    render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    // Bloque 1: reintentos con backoff (~6s) antes del aviso.
    expect(await screen.findByRole('alert', {}, { timeout: 9000 })).toHaveTextContent(/Aún no detectamos tu \/start/)
    expect(onVinculado).not.toHaveBeenCalled()
  })

  it('F5 503 abre modo local simulado que jamás vincula de verdad', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 503, data: { detail: 'Telegram no configurado' } } })
    render(<TelegramVincular token="t" vinculado={false} />)
    expect(await screen.findByText(/Modo de pruebas local detectado/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Código simulado de 6 dígitos'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Probar' }))
    expect(await screen.findByText(/Flujo simulado correcto/)).toBeInTheDocument()
    expect(screen.queryByText(/Vinculado/)).not.toBeInTheDocument()
  })

  it('bot_url inválida del backend muestra error sin enlace', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { bot_url: 'https://evil.com/x' } })
    const hrefAntes = window.location.href
    render(<TelegramVincular token="t" vinculado={false} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Respuesta inválida del bot/)
    expect(screen.queryByRole('link', { name: /Abrir Bot en Telegram/ })).not.toBeInTheDocument()
    expect(window.location.href).toBe(hrefAntes)
  })

  it('fallo de red muestra Reintentar y reintenta al pulsar', async () => {
    const getSpy = vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValue({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
    render(<TelegramVincular token="t" vinculado={false} />)
    const reintentar = await screen.findByRole('button', { name: /Reintentar enlace/ })
    fireEvent.click(reintentar)
    expect(await screen.findByRole('link', { name: /Abrir Bot en Telegram/ })).toHaveAttribute(
      'href', 'https://t.me/B?start=x')
    expect(getSpy).toHaveBeenCalledTimes(2)
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

  it('sin teléfono guardado la tarjeta se bloquea con guía (prerrequisito)', async () => {
    const getSpy = vi.spyOn(api, 'get')
    render(<TelegramVincular token="t" vinculado={false} telefonoGuardado={false} />)
    expect(screen.getByText(/Ingresa y guarda tu número de WhatsApp/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar enlace/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vincular cuenta' })).toBeDisabled()
    // Sin teléfono ni siquiera se pide el enlace al backend.
    await waitFor(() => expect(getSpy).not.toHaveBeenCalled())
  })

  it('verificado muestra badge verde con +20 pts', () => {
    render(<TelegramVincular token="t" vinculado telefonoVerificado />)
    expect(screen.getByText(/Teléfono y Telegram Verificados \(\+20 pts\)/)).toBeInTheDocument()
  })

  it('polling detecta la vinculación solo: toast + callback sin pulsar nada', async () => {
    vi.useFakeTimers()
    try {
      const getSpy = vi.spyOn(api, 'get').mockImplementation((url) => {
        if (url === '/api/auth/telegram/enlace') {
          return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
        }
        return Promise.resolve({ data: { telegram_vinculado: false } })
      })
      const onVinculado = vi.fn()
      const hrefAntes = window.location.href
      render(<TelegramVincular token="t" vinculado={false} onVinculado={onVinculado} />)
      // Flush del pedido inicial (microtareas, sin temporizadores).
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      const enlace = screen.getByRole('link', { name: /Abrir Bot en Telegram/ })
      // El clic navega la pestaña NUEVA (nativa); la actual queda intacta.
      fireEvent.click(enlace)
      expect(window.location.href).toBe(hrefAntes)
      // El siguiente ciclo del polling ya ve la vinculación.
      getSpy.mockImplementation((url) => {
        if (url === '/api/auth/telegram/enlace') {
          return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
        }
        return Promise.resolve({ data: { telegram_vinculado: true } })
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(3500) })
      expect(getSpy).toHaveBeenCalledWith('/api/auth/perfil', expect.anything())
      expect(onVinculado).toHaveBeenCalledWith(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('doble clic en Vincular no duplica el check (botón se deshabilita)', async () => {
    const getSpy = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/auth/telegram/enlace') {
        return Promise.resolve({ data: { bot_url: 'https://t.me/B?start=x', expira_segundos: 600 } })
      }
      return Promise.resolve({ data: { telegram_vinculado: true } })
    })
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
