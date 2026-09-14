import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Card from './Card'

afterEach(()=> cleanup())

const basePub = {
  id: 1,
  titulo: 'Habitación cerca Tulcán - 320m',
  canon_mensual: 480000,
  zona_nombre: 'Tulcán',
  distancia_geodesica_m: 111,
  indice_confianza: 100,
  fotos: ['https://a.com/1.jpg','https://a.com/2.jpg','https://a.com/3.jpg','https://a.com/4.jpg'],
  estado: 'ACTIVO',
  servicios: ['WiFi Fibra', 'Baño Privado'],
}

describe('Card - HU-001/003 y overflow', ()=>{
  it('renderiza título y precio sin desbordar (truncate)', ()=>{
    render(<Card pub={basePub} />)
    expect(screen.getByText('Habitación cerca Tulcán - 320m')).toBeInTheDocument()
    // precio y unidad están en elementos separados ($480.000 + COP/mes)
    expect(screen.getByText(/480/)).toBeInTheDocument()
    expect(screen.getByText(/COP\/mes/)).toBeInTheDocument()
  })

  it('muestra distancia y zona truncados', ()=>{
    render(<Card pub={basePub} />)
    expect(screen.getAllByText(/Tulcán/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/111/).length).toBeGreaterThan(0)
  })

  it('maneja fotos como array (no muestra URLs crudas)', ()=>{
    render(<Card pub={basePub} />)
    // Debe mostrar "4 fotos" (overlay + texto), no URLs crudas
    expect(screen.getAllByText(/4 fotos/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/https:\/\/a.com/)).not.toBeInTheDocument()
  })

  it('maneja fotos como número legacy', ()=>{
    render(<Card pub={{...basePub, fotos: 4}} />)
    expect(screen.getAllByText(/4 fotos/).length).toBeGreaterThan(0)
  })

  it('maneja canon legacy', ()=>{
    render(<Card pub={{...basePub, canon: 500000, canon_mensual: undefined}} />)
    expect(screen.getByText(/\$.*500/)).toBeInTheDocument()
  })

  it('maneja zona legacy', ()=>{
    render(<Card pub={{...basePub, zona: 'Pandiguando', zona_nombre: undefined}} />)
    expect(screen.getByText(/Pandiguando/)).toBeInTheDocument()
  })

  it('maneja distancia legacy dist_m', ()=>{
    render(<Card pub={{...basePub, dist_m: 320, distancia_geodesica_m: undefined, zona_nombre: 'Centro'}} />)
    expect(screen.getByText(/Centro/)).toBeInTheDocument()
    expect(screen.getAllByText(/320/).length).toBeGreaterThan(0)
  })

  it('no desborda con título muy largo (line-clamp)', ()=>{
    const longTitle = 'A'.repeat(200)
    const { container } = render(<Card pub={{...basePub, titulo: longTitle}} />)
    const h3 = container.querySelector('h3')
    expect(h3.className).toContain('line-clamp-2')
    expect(h3.className).toContain('break-words')
  })

  it('canon nulo muestra No informado (no $0)', ()=>{
    render(<Card pub={{...basePub, canon_mensual: null, canon: null}} />)
    expect(screen.getByText('No informado')).toBeInTheDocument()
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument()
  })

  it('badge minimalista: punto + número con tooltip de detalle', ()=>{
    const { rerender } = render(<Card pub={{...basePub, indice_confianza: 100}} />)
    const pill = screen.getByLabelText('Confianza Alta: 100 de 100')
    expect(pill).toHaveTextContent('🟢')
    expect(pill).toHaveTextContent('100')
    expect(pill).toHaveAttribute('title', 'Confianza Alta: 100/100')
    rerender(<Card pub={{...basePub, indice_confianza: 65}} />)
    expect(screen.getByLabelText('Confianza Media: 65 de 100')).toHaveTextContent('🟡')
    rerender(<Card pub={{...basePub, indice_confianza: 40}} />)
    expect(screen.getByLabelText('Confianza Básica: 40 de 100')).toHaveTextContent('🔴')
    // Sin texto extenso sobre la foto
    expect(screen.queryByText(/100 — Alto/)).not.toBeInTheDocument()
  })

  it('container tiene overflow-hidden y min-w-0 para evitar desborde', ()=>{
    const { container } = render(<Card pub={basePub} />)
    const card = container.firstChild
    expect(card.className).toContain('overflow-hidden')
    expect(card.className).toContain('min-w-0')
  })
})

describe('Card - carousel táctil (v4)', ()=>{
  it('muestra contador 1/4 y dots con labels', ()=>{
    render(<Card pub={basePub} />)
    expect(screen.getByText('1/4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver foto 2' })).toBeInTheDocument()
  })

  it('swipe izquierda avanza foto sin navegar (stopPropagation)', ()=>{
    const { container } = render(<Card pub={basePub} />)
    const img = () => container.querySelector('img')
    expect(img().getAttribute('src')).toBe('https://a.com/1.jpg')
    // La zona táctil es el contenedor de la imagen (h-36)
    const tactil = Array.from(container.querySelectorAll('div')).find(d => d.className.includes('h-36'))
    fireEvent.touchStart(tactil, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(tactil, { changedTouches: [{ clientX: 100 }] })
    expect(img().getAttribute('src')).toBe('https://a.com/2.jpg')
    expect(screen.getByText('2/4')).toBeInTheDocument()
  })

  it('swipe corto (<40px) no cambia de foto', ()=>{
    const { container } = render(<Card pub={basePub} />)
    const tactil = Array.from(container.querySelectorAll('div')).find(d => d.className.includes('h-36'))
    fireEvent.touchStart(tactil, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(tactil, { changedTouches: [{ clientX: 180 }] })
    expect(container.querySelector('img').getAttribute('src')).toBe('https://a.com/1.jpg')
  })

  it('dot lleva directo a la foto sin navegar', ()=>{
    const { container } = render(<Card pub={basePub} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver foto 3' }))
    expect(container.querySelector('img').getAttribute('src')).toBe('https://a.com/3.jpg')
  })

  it('sin fotos múltiples no muestra contador', ()=>{
    render(<Card pub={{...basePub, fotos: ['https://a.com/1.jpg']}} />)
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })
})
