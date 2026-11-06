import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Comparar, { humanizarTipoComparar, textoTiempoConCampus } from './Comparar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: { get: vi.fn() },
  isCancelError: (e) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError',
}))
vi.mock('../contexts/CompararContext', () => ({
  useComparar: () => ({ comparar: [1, 2], clear: vi.fn(), toggle: vi.fn(), error: '' }),
}))

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear(); sessionStorage.clear() } catch { /* noop */ }
})

const PUB1 = {
  id: 1, titulo: 'Habitación Tulcán', canon_mensual: 480000, deposito_requerido: 0,
  tipo_inmueble: 'HABITACION_INDEPENDIENTE', zona_nombre: 'Tulcán',
  indice_confianza: 100, servicios: ['WiFi Fibra'], fotos: ['https://a.com/1.jpg', 'https://a.com/2.jpg'],
  estado: 'ACTIVO', direccion_referencial: 'Calle 5', distancia_geodesica_m: 150,
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

  it('textoTiempoConCampus sincroniza el contexto (Bloque 4)', () => {
    expect(textoTiempoConCampus(150, 'Campus Tulcán')).toContain('Campus Tulcán')
    expect(textoTiempoConCampus(150, '')).toContain('campus más cercano')
    expect(textoTiempoConCampus(null, 'Campus Tulcán')).toBeNull()
  })
})

describe('Comparar v8', () => {
  it('usa el campus global de Buscar aunque su URL no traiga ?campus_id=', async () => {
    try { localStorage.setItem('alojau_campus_filtro', '1') } catch { /* noop */ }
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') {
        return Promise.resolve({ data: [{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcán' }] })
      }
      if (url === '/api/publicaciones/1') return Promise.resolve({ data: PUB1 })
      if (url === '/api/publicaciones/2') return Promise.resolve({ data: PUB2 })
      return Promise.reject(new Error('404'))
    })
    render(<MemoryRouter initialEntries={['/comparar']}><Comparar /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText(/de Universidad del Cauca - Campus Tulcán/).length).toBeGreaterThanOrEqual(1))
    try { localStorage.clear() } catch { /* noop */ }
  })
  it('cabecera con miniatura + título por columna', async () => {
    mockPubs()
    render(<MemoryRouter><Comparar /></MemoryRouter>)
    // Título en cabecera + fila Título + tarjeta móvil: al menos 2 presencias.
    await waitFor(() => expect(screen.getAllByText('Habitación Tulcán').length).toBeGreaterThanOrEqual(2))
    expect(screen.getAllByAltText('Foto principal de Habitación Tulcán').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('img', { name: 'Sin foto' }).length).toBeGreaterThanOrEqual(1)
  })

  it('tipos legibles, badge minimalista y CTA Ver anuncio', async () => {
    mockPubs()
    render(<MemoryRouter><Comparar /></MemoryRouter>)
    // Tabla PC + tarjetas móvil duplican el contenido (misma info exacta).
    await waitFor(() => expect(screen.getAllByText('Habitación independiente').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('Apartaestudio').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('HABITACION_INDEPENDIENTE')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Confianza Alta: 100 de 100').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByLabelText('Confianza Media: 65 de 100').length).toBeGreaterThanOrEqual(1)
    // Tabla PC + tarjetas móvil comparten la misma info (duplicada en jsdom).
    const ctas = screen.getAllByRole('link', { name: 'Ver anuncio' })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    expect(ctas[0]).toHaveAttribute('href', '/publicacion/1')
  })
})
