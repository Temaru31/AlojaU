import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CercanoA from './CercanoA'

afterEach(() => cleanup())

const LUGARES = [
  { id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcán', categoria: 'UNIVERSIDAD' },
  { id: 3, institucion: 'Centro Comercial Campanario', nombre_sede: 'Sede Única', categoria: 'CENTRO_COMERCIAL' },
  { id: 4, institucion: 'Hospital Universitario San José', nombre_sede: 'Sede Principal', categoria: 'SALUD' },
]

function abrir(props = {}) {
  render(<CercanoA lugares={LUGARES} value={null} onChange={() => {}} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Todos los lugares/ }))
}

describe('CercanoA 004 POIs', () => {
  it('agrupa opciones por categoría con encabezados', () => {
    abrir()
    expect(screen.getByText(/Universidades/)).toBeInTheDocument()
    expect(screen.getByText(/Centros comerciales/)).toBeInTheDocument()
    expect(screen.getByText(/Salud/)).toBeInTheDocument()
    expect(screen.getByText('Universidad del Cauca - Campus Tulcán')).toBeInTheDocument()
  })

  it('filtra por texto (ej: hospital)', () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Buscar lugar de referencia'), { target: { value: 'hospital' } })
    expect(screen.queryByText('Universidad del Cauca - Campus Tulcán')).not.toBeInTheDocument()
    expect(screen.getByText('Hospital Universitario San José - Sede Principal')).toBeInTheDocument()
  })

  it('elegir un lugar llama onChange con su id', () => {
    const onChange = vi.fn()
    abrir({ onChange })
    fireEvent.click(screen.getByText('Centro Comercial Campanario'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('"Todos los lugares" llama onChange con null', () => {
    const onChange = vi.fn()
    render(<CercanoA lugares={LUGARES} value={3} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Campanario/ }))
    fireEvent.click(screen.getByRole('option', { name: /Todos los lugares/ }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('muestra el lugar seleccionado en el botón', () => {
    render(<CercanoA lugares={LUGARES} value={4} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Hospital Universitario/ })).toBeInTheDocument()
  })
})
