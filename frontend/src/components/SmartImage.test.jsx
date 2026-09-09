import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SmartImage, { normalizeImgUrl, FALLBACK_IMG } from './SmartImage'

afterEach(() => cleanup())

describe('SmartImage F0', () => {
  it('normaliza Unsplash con auto=format una sola vez', () => {
    expect(normalizeImgUrl('https://images.unsplash.com/photo-1?w=600')).toContain('auto=format')
    expect(normalizeImgUrl('https://images.unsplash.com/photo-1?w=600&auto=format&q=80')).toBe('https://images.unsplash.com/photo-1?w=600&auto=format&q=80')
    expect(normalizeImgUrl('https://a.com/1.jpg')).toBe('https://a.com/1.jpg')
  })

  it('muestra img con lazy + no-referrer', () => {
    render(<SmartImage src="https://a.com/1.jpg" alt="Foto 1" />)
    const img = screen.getByAltText('Foto 1')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('tras 3 fallos muestra fallback local sin bucle', () => {
    render(<SmartImage src="https://a.com/rota.jpg" alt="Rota" />)
    let img = screen.getByAltText('Rota')
    fireEvent.error(img)
    img = screen.getByAltText('Rota')
    fireEvent.error(img)
    img = screen.getByAltText('Rota')
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: 'Rota' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Rota' }).querySelector('img').getAttribute('src')).toContain(FALLBACK_IMG)
  })

  it('sin src muestra placeholder accesible', () => {
    render(<SmartImage src={null} alt="Sin foto" />)
    expect(screen.getByRole('img', { name: 'Sin foto' })).toBeInTheDocument()
  })

  it('tono dark usa fondo oscuro (visor)', () => {
    render(<SmartImage src={null} alt="Noche" tone="dark" />)
    expect(screen.getByRole('img', { name: 'Noche' }).className).toContain('bg-neutral-800')
  })
})
