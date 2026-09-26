import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Buscar from './Buscar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() }, isCancelError: (e) => e?.code === 'ERR_CANCELED' }))
vi.mock('../components/Card', () => ({ default: ({ pub }) => <div>{pub.titulo}</div> }))
vi.mock('../components/Filtros', () => ({ default: () => null, contarAvanzados: () => 0 }))
vi.mock('../components/Paginacion', () => ({ default: () => null }))

const CAMPUS = [{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcán' }]

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url === '/api/campus') return Promise.resolve({ data: CAMPUS })
    if (url === '/api/ciudades') return Promise.resolve({ data: [{ id: 1, nombre: 'Popayán', departamento: 'Cauca', slug: 'popayan' }] })
    return Promise.resolve({ data: { items: [], total: 0, pages: 1 } })
  })
})

function renderBuscar(qs = '/?campus_id=1') {
  return render(
    <MemoryRouter initialEntries={[qs]}>
      <Buscar />
    </MemoryRouter>
  )
}

describe('Buscar Oleada 2 (q)', () => {
  it('escribir en el buscador consulta al backend con q (debounce)', async () => {
    renderBuscar()
    // Cápsula móvil + barra desktop montan 2 searchbox: se usa el primero.
    const inputs = await screen.findAllByRole('searchbox')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
    const input = inputs[0]
    vi.useFakeTimers()
    fireEvent.change(input, { target: { value: 'habitacion' } })
    await act(async () => { vi.advanceTimersByTime(350) })
    vi.useRealTimers()
    await waitFor(() => {
      const calls = api.get.mock.calls.filter(c => c[0] === '/api/publicaciones')
      expect(calls.length).toBeGreaterThan(0)
      expect(calls[calls.length - 1][1].params.q).toBe('habitacion')
    })
  })

  it('vacío 200 OK con [] muestra tarjeta neutra (sin banner rojo) + botón limpiar', async () => {
    renderBuscar('/?campus_id=1&q=habitacion')
    await waitFor(() => expect(screen.getByText(/No encontramos alojamientos/)).toBeInTheDocument())
    expect(screen.getByText(/cerca a la universidad/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Limpiar filtros/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('error HTTP >=400 sí muestra banner rojo', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: CAMPUS })
      if (url === '/api/ciudades') return Promise.resolve({ data: [] })
      if (url === '/api/publicaciones') return Promise.reject({ response: { status: 500 } })
      return Promise.resolve({ data: { items: [], total: 0, pages: 1 } })
    })
    renderBuscar('/?campus_id=1')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/No se pudo cargar publicaciones/)).toBeInTheDocument()
  })
})

describe('Buscar 004 campus_id inválido', () => {
  it('?campus_id=abc equivale a Todos (no envía el param)', async () => {
    renderBuscar('/?campus_id=abc')
    await waitFor(() => {
      const llamadas = api.get.mock.calls.filter(([u]) => u === '/api/publicaciones')
      expect(llamadas.length).toBeGreaterThan(0)
      const params = llamadas[0][1]?.params || {}
      expect(params.campus_id).toBeUndefined()
    })
  })
})

describe('Buscar Fase 4 Hero + multiciudad', () => {
  it('hero usa copy nuevo y ciudad dinámica', async () => {
    renderBuscar('/')
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    expect(screen.getByText(/donde lo necesitas/)).toBeInTheDocument()
    expect(screen.getByText(/sin intermediarios/)).toBeInTheDocument()
  })

  it('píldora del Hero refleja la ciudad del selector (misma fuente)', async () => {
    renderBuscar('/?ciudad_id=1')
    await waitFor(() => {
      // Píldora del Hero + botón del selector comparten "Popayán, Cauca".
      expect(screen.getAllByText('Popayán, Cauca').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('abre bottom sheet móvil con atajos COP, tipo y CTA honesto en cero', async () => {
    renderBuscar('/')
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Abrir filtros/ }))
    expect(screen.getByRole('dialog', { name: /Filtros de búsqueda/ })).toBeInTheDocument()
    // Desktop + sheet montan doble control: basta que el sheet aporte el suyo.
    expect(screen.getAllByLabelText('Cercano a…').length).toBeGreaterThanOrEqual(1)
    // F4: atajos de presupuesto (COP) y tipo escriben el mismo estado `filtros`.
    fireEvent.click(screen.getByRole('button', { name: '< $400 mil' }))
    expect(screen.getByRole('button', { name: '< $400 mil' })).toHaveAttribute('aria-pressed', 'true')
    // Toggle-off: pulsar el activo limpia el rango.
    fireEvent.click(screen.getByRole('button', { name: '< $400 mil' }))
    expect(screen.getByRole('button', { name: '< $400 mil' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Compartida' }))
    expect(screen.getByRole('button', { name: 'Compartida' })).toHaveAttribute('aria-pressed', 'true')
    // Mock con total 0: CTA honesto + salida Limpiar.
    expect(screen.getByRole('button', { name: 'Cerrar y ajustar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todos los filtros' }))
    expect(screen.getByRole('button', { name: '< $400 mil' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar y ajustar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Filtros de búsqueda/ })).not.toBeInTheDocument())
  })

  it('CTA muestra conteo en vivo cuando hay resultados', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: CAMPUS })
      if (url === '/api/ciudades') return Promise.resolve({ data: [{ id: 1, nombre: 'Popayán', departamento: 'Cauca', slug: 'popayan' }] })
      return Promise.resolve({ data: { items: [], total: 5, pages: 1 } })
    })
    renderBuscar('/')
    await waitFor(() => expect(screen.getByText(/Encuentra tu espacio ideal/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Abrir filtros/ }))
    expect(screen.getByRole('button', { name: 'Mostrar 5 alojamientos' })).toBeInTheDocument()
  })
})
