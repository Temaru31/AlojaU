import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Buscar from './Buscar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../components/Card', () => ({ default: ({ pub }) => <div>{pub.titulo}</div> }))
vi.mock('../components/Filtros', () => ({ default: () => null }))
vi.mock('../components/Paginacion', () => ({ default: () => null }))

const CAMPUS = [{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcán' }]

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url === '/api/campus') return Promise.resolve({ data: CAMPUS })
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
    const input = await screen.findByRole('searchbox')
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

  it('vacío con q muestra sugerencias útiles + botón limpiar', async () => {
    renderBuscar('/?campus_id=1&q=habitacion')
    await waitFor(() => expect(screen.getByText(/Sin resultados/)).toBeInTheDocument())
    expect(screen.getByText(/cerca a la universidad/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Limpiar búsqueda y filtros/ })).toBeInTheDocument()
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
