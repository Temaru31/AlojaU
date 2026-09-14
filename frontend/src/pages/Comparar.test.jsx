import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Comparar, { humanizarTipoComparar } from './Comparar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../contexts/CompararContext', () => ({
  useComparar: () => ({ comparar: [1, 2], clear: vi.fn(), toggle: vi.fn(), error: '' }),
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const PUB1 = {
  id: 1, titulo: 'Habitación Tulcán', canon_mensual: 480000, deposito_requerido: 0,
  tipo_inmueble: 'HABITACION_INDEPENDIENTE', zona_nombre: 'Tulcán',
  indice_confianza: 100, servicios: ['WiFi Fibra'], fotos: ['https://a.com/1.jpg', 'https://a.com/2.jpg'],
  estado: 'ACTIVO', direccion_referencial: 'Calle 5',
}
const PUB2 = {
  id: 2, titulo: 'Apartaestudio Centro', canon_mensual: 750000,
  tipo_inmueble: 'APARTAESTUDIO', zona_nombre: 'Centro',
  indice_confianza: 65, servicios: [], fotos: [],
  estado: 'ACTIVO', direccion_referencial: 'Carrera 8',
}

function mockPubs() {
  api.get.mockImplementation((url) => {
    if (url === '/api/publicaciones/1') return Promise.resolve({ data: PUB1 })
    if (url === '/api/publicaciones/2') return Promise.resolve({ data: PUB2 })
    return Promise.reject(new Error('404'))
  })
}

describe('humanizarTipoComparar', () => {
  it('traduce ENUMs a texto legible', () => {
    expect(humanizarTipoComparar('HABITACION_INDEPENDIENTE')).toBe('Habitación independiente')
    expect(humanizarTipoComparar('APARTAESTUDIO')).toBe('Apartaestudio')
    expect(humanizarTipoComparar('COMPARTIDO')).toBe('Compartido')
    expect(humanizarTipoComparar('APARTAMENTO')).toBe('Apartamento')
    expect(humanizarTipoComparar('HABITACION_FAMILIAR')).toBe('Habitación familiar')
    expect(humanizarTipoComparar(null)).toBeNull()
  })
})

describe('Comparar v8', () => {
  it('cabecera con miniatura + título por columna', async () => {
    mockPubs()
    render(<MemoryRouter><Comparar /></MemoryRouter>)
    // Título en cabecera + fila Título: al menos 2 presencias.
    await waitFor(() => expect(screen.getAllByText('Habitación Tulcán').length).toBeGreaterThanOrEqual(2))
    expect(screen.getByAltText('Foto principal de Habitación Tulcán')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sin foto' })).toBeInTheDocument()
  })

  it('tipos legibles, badge minimalista y CTA Ver anuncio', async () => {
    mockPubs()
    render(<MemoryRouter><Comparar /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Habitación independiente')).toBeInTheDocument())
    expect(screen.getByText('Apartaestudio')).toBeInTheDocument()
    expect(screen.queryByText('HABITACION_INDEPENDIENTE')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Confianza Alta: 100 de 100')).toBeInTheDocument()
    expect(screen.getByLabelText('Confianza Media: 65 de 100')).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: 'Ver anuncio' })
    expect(ctas).toHaveLength(2)
    expect(ctas[0]).toHaveAttribute('href', '/publicacion/1')
    expect(ctas[1]).toHaveAttribute('href', '/publicacion/2')
  })
})
