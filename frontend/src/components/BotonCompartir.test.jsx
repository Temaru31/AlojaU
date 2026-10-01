import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import BotonCompartir, { compartirEnlace } from './BotonCompartir'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('compartirEnlace (nativo con fallback honesto)', () => {
  it('usa navigator.share cuando existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await compartirEnlace({ titulo: 'Aviso', url: 'https://x/1' })).toBe('compartido')
    expect(share).toHaveBeenCalledWith({ title: 'Aviso', url: 'https://x/1' })
    vi.unstubAllGlobals()
  })

  it('sin share copia al portapapeles y avisa con toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const eventos = []
    const oyente = (e) => eventos.push(e.detail)
    window.addEventListener('alojau:toast', oyente)
    expect(await compartirEnlace({ titulo: 'Aviso', url: 'https://x/1' })).toBe('copiado')
    expect(writeText).toHaveBeenCalledWith('https://x/1')
    expect(eventos).toEqual([{ message: 'Enlace copiado al portapapeles', href: undefined }])
    window.removeEventListener('alojau:toast', oyente)
    vi.unstubAllGlobals()
  })

  it('si todo falla retorna fallo sin toast falso', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denegado')) } })
    expect(await compartirEnlace({ titulo: 'Aviso', url: 'https://x/1' })).toBe('fallo')
    vi.unstubAllGlobals()
  })
})

describe('BotonCompartir variante flotante + texto', () => {
  it('flotante es circular oscuro con mismo accessible name', () => {
    render(<BotonCompartir titulo="Aviso" url="https://x/1" etiqueta="Compartir esta publicación" variante="flotante" />)
    const btn = screen.getByRole('button', { name: 'Compartir esta publicación' })
    expect(btn.className).toMatch(/w-11 h-11/)
    expect(btn.className).toMatch(/bg-black\/60/)
  })

  it('envía texto cuando se provee', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await compartirEnlace({ titulo: 'T', texto: 'Hola', url: 'https://x/1' })).toBe('compartido')
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'Hola', url: 'https://x/1' })
    vi.unstubAllGlobals()
  })
})

describe('BotonCompartir', () => {
  it('muestra etiqueta propia y reintenta tras fallo', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('x')) } })
    render(<BotonCompartir titulo="Aviso" url="https://x/1" etiqueta="Compartir aviso" />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir aviso' }))
    // El aria-label estable conserva el nombre; el texto visible cambia.
    await waitFor(() => expect(screen.getByText('Reintentar')).toBeInTheDocument())
    vi.unstubAllGlobals()
  })
})
