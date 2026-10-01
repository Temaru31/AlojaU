// BUG#1: Card pinta la portada (orden=1) tras refetch aunque fotos venga en heap.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Card from './Card'

afterEach(() => cleanup())

describe('Card portada (BUG#1)', () => {
  it('usa imagenes[orden=1] aunque fotos[0] sea otra', () => {
    const pub = {
      id: 99,
      titulo: 'Aviso con portada reordenada',
      canon_mensual: 500000,
      zona_nombre: 'Centro',
      indice_confianza: 80,
      fotos: ['https://heap-segunda.jpg', 'https://heap-portada.jpg'],
      imagenes: [
        { id: 2, url: 'https://heap-portada.jpg', orden: 1 },
        { id: 1, url: 'https://heap-segunda.jpg', orden: 2 },
      ],
    }
    render(<Card pub={pub} />)
    const img = screen.getByAltText('Aviso con portada reordenada')
    expect(img.getAttribute('src')).toBe('https://heap-portada.jpg')
  })

  it('sin imagenes usa fotos[0]', () => {
    const pub = {
      id: 100,
      titulo: 'Aviso lista simple',
      canon_mensual: 300000,
      zona_nombre: 'Norte',
      indice_confianza: 70,
      fotos: ['https://primera.jpg', 'https://segunda.jpg'],
    }
    render(<Card pub={pub} />)
    expect(screen.getByAltText('Aviso lista simple').getAttribute('src')).toBe(
      'https://primera.jpg',
    )
  })
})
