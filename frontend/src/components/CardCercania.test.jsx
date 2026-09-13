import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Card from './Card'

afterEach(() => cleanup())

const basePub = {
  id: 1,
  titulo: 'Habitación cerca Tulcán - 320m',
  canon_mensual: 480000,
  zona_nombre: 'Tulcán',
  distancia_geodesica_m: 320,
  indice_confianza: 100,
  fotos: ['https://a.com/1.jpg'],
  estado: 'ACTIVO',
  servicios: ['WiFi Fibra'],
}

describe('Card 004 badge de cercanía', () => {
  it('con lugarNombre muestra "A X m · Y min a pie de [Lugar]"', () => {
    render(<Card pub={basePub} lugarNombre="Campus Tulcán" />)
    expect(screen.getByText(/A 320 m · .* de Campus Tulcán/)).toBeInTheDocument()
  })

  it('sin lugarNombre conserva el texto legado de distancia', () => {
    render(<Card pub={basePub} />)
    expect(screen.getByText(/320 m/)).toBeInTheDocument()
    expect(screen.queryByText(/de Campus/)).not.toBeInTheDocument()
  })

  it('con lugar pero sin distancia no inventa badge', () => {
    render(<Card pub={{ ...basePub, distancia_geodesica_m: null }} lugarNombre="Campus Tulcán" />)
    expect(screen.queryByText(/de Campus Tulcán/)).not.toBeInTheDocument()
  })
})
