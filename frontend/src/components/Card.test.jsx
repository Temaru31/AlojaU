import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
    // precio formateado COP
    expect(screen.getByText(/\$.*480.*COP\/mes/)).toBeInTheDocument()
  })

  it('muestra distancia y zona truncados', ()=>{
    render(<Card pub={basePub} />)
    expect(screen.getByText(/111.*Tulcán/)).toBeInTheDocument()
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
    expect(screen.getByText(/320.*Centro/)).toBeInTheDocument()
  })

  it('no desborda con título muy largo (line-clamp)', ()=>{
    const longTitle = 'A'.repeat(200)
    const { container } = render(<Card pub={{...basePub, titulo: longTitle}} />)
    const h3 = container.querySelector('h3')
    expect(h3.className).toContain('line-clamp-2')
    expect(h3.className).toContain('break-words')
  })

  it('badge confianza color según índice', ()=>{
    const { rerender } = render(<Card pub={{...basePub, indice_confianza: 85}} />)
    expect(screen.getByText(/Confianza 85/)).toBeInTheDocument()
    rerender(<Card pub={{...basePub, indice_confianza: 60}} />)
    expect(screen.getByText(/Confianza 60/)).toBeInTheDocument()
  })

  it('container tiene overflow-hidden y min-w-0 para evitar desborde', ()=>{
    const { container } = render(<Card pub={basePub} />)
    const card = container.firstChild
    expect(card.className).toContain('overflow-hidden')
    expect(card.className).toContain('min-w-0')
  })
})
