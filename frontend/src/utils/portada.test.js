// BUG#1: helper central de portada (orden=1 primero).
import { describe, it, expect } from 'vitest'
import { portadaUrl, fotosOrdenadas, imagenesOrdenadas } from './portada'

describe('portada (BUG#1)', () => {
  it('prefiere imagenes por orden aunque fotos venga desordenada', () => {
    const pub = {
      fotos: ['https://heap-b.jpg', 'https://heap-a.jpg'],
      imagenes: [
        { id: 2, url: 'https://heap-b.jpg', orden: 2 },
        { id: 1, url: 'https://heap-a.jpg', orden: 1 },
      ],
    }
    expect(imagenesOrdenadas(pub).map((i) => i.id)).toEqual([1, 2])
    expect(portadaUrl(pub)).toBe('https://heap-a.jpg')
    expect(fotosOrdenadas(pub)).toEqual(['https://heap-a.jpg', 'https://heap-b.jpg'])
  })

  it('sin imagenes usa fotos[0] (cards de lista)', () => {
    const pub = { fotos: ['https://p.jpg', 'https://q.jpg'] }
    expect(portadaUrl(pub)).toBe('https://p.jpg')
    expect(fotosOrdenadas(pub)).toEqual(['https://p.jpg', 'https://q.jpg'])
  })

  it('sin fotos retorna null/[]', () => {
    expect(portadaUrl({})).toBeNull()
    expect(portadaUrl({ fotos: [] })).toBeNull()
    expect(fotosOrdenadas({})).toEqual([])
  })

  it('card usa portada tras refetch (heap invertido -> portada estable)', () => {
    // Simula refetch donde el heap invirtió el orden pero imagenes conserva orden.
    const refetch = {
      fotos: ['https://segunda.jpg', 'https://portada.jpg'],
      imagenes: [
        { id: 9, url: 'https://portada.jpg', orden: 1 },
        { id: 8, url: 'https://segunda.jpg', orden: 2 },
      ],
    }
    expect(portadaUrl(refetch)).toBe('https://portada.jpg')
  })
})
