import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Alertas, { GuardarAlerta } from './Alertas'
import { filtrosABusqueda, MAX_ALERTAS } from '../utils/alertas'
import * as Auth from '../contexts/AuthContext'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}))

const CON_TOKEN = { token: 't', user: { email: 'a@b.co' }, loading: false }
const SIN_TOKEN = { token: '', user: null, loading: false }

function mockAuth(valor) {
  vi.spyOn(Auth, 'useAuth').mockReturnValue({
    login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), actualizarUsuario: vi.fn(), ...valor,
  })
}

function renderAlerta() {
  return render(<MemoryRouter><Alertas /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
beforeEach(() => vi.clearAllMocks())

describe('filtrosABusqueda (mapeo Buscar -> alerta)', () => {
  it('normaliza vacíos a null y servicios a enteros', () => {
    expect(filtrosABusqueda({ min: '', max: '', tipo: '', servicios: '' }, null)).toEqual({
      precio_min: null, precio_max: null, campus_id: null, tipo: null, servicios_ids: [],
    })
    expect(filtrosABusqueda({ min: '300000', max: '600000', tipo: 'apartaestudio', servicios: '1,2' }, 7)).toEqual({
      precio_min: 300000, precio_max: 600000, campus_id: 7, tipo: 'APARTAESTUDIO', servicios_ids: [1, 2],
    })
  })

  it('descarta valores inválidos sin romper', () => {
    expect(filtrosABusqueda({ min: 'abc', max: '-5', tipo: '  ', servicios: 'x,2' }, 0)).toEqual({
      precio_min: null, precio_max: null, campus_id: null, tipo: null, servicios_ids: [2],
    })
  })
})

describe('Alertas (Fase 3)', () => {
  it('sin sesión pide login y no toca la API privada', () => {
    mockAuth(SIN_TOKEN)
    renderAlerta()
    expect(screen.getByText(/Inicia sesión para guardar alertas/)).toBeInTheDocument()
    // El catálogo público sí puede pedirse; la bandeja privada jamás sin token.
    expect(api.get).not.toHaveBeenCalledWith('/api/busquedas-guardadas', expect.anything())
  })

  it('lista alertas y permite crear', async () => {
    mockAuth(CON_TOKEN)
    api.get.mockImplementation((url) => {
      if (url === '/api/busquedas-guardadas') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({
      data: { id: 9, nombre: 'Cerca U', precio_min: 300000, precio_max: null, campus_id: null, tipo: null, servicios_ids: [], activa: true },
    })
    renderAlerta()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/busquedas-guardadas', expect.anything()))
    fireEvent.change(screen.getByPlaceholderText('Cerca a la U, barato'), { target: { value: 'Cerca U' } })
    fireEvent.change(screen.getByPlaceholderText('300000'), { target: { value: '300000' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear alerta/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/busquedas-guardadas', expect.objectContaining({ nombre: 'Cerca U', precio_min: 300000 }), expect.anything()))
    expect(await screen.findByText('Cerca U')).toBeInTheDocument()
  })

  it(`tope de ${MAX_ALERTAS}: bloquea crear con mensaje amigable`, async () => {
    mockAuth(CON_TOKEN)
    const diez = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nombre: `A${i}`, activa: true, servicios_ids: [] }))
    api.get.mockImplementation((url) => {
      if (url === '/api/busquedas-guardadas') return Promise.resolve({ data: diez })
      return Promise.resolve({ data: [] })
    })
    renderAlerta()
    await waitFor(() => expect(screen.getByText(/10 alertas activas/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Crear alerta/ })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sobre el tope heredado muestra el conteo real y permite gestionar', async () => {
    mockAuth(CON_TOKEN)
    const doce = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, nombre: `A${i}`, activa: true, servicios_ids: [] }))
    api.get.mockImplementation((url) => {
      if (url === '/api/busquedas-guardadas') return Promise.resolve({ data: doce })
      return Promise.resolve({ data: [] })
    })
    renderAlerta()
    // Estado degradado elegante: dice 12 (no el tope) y bloquea crear.
    await waitFor(() => expect(screen.getByText(/Tienes 12 alertas activas/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Crear alerta/ })).toBeDisabled()
    // Leer y borrar siguen intactos.
    expect(screen.getAllByRole('button', { name: /Eliminar alerta/ })).toHaveLength(12)
  })

  it('sin ningún filtro bloquea con guía y no postea', async () => {
    mockAuth(CON_TOKEN)
    api.get.mockImplementation((url) => {
      if (url === '/api/busquedas-guardadas') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    renderAlerta()
    await waitFor(() => expect(screen.getByRole('button', { name: /Crear alerta/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Crear alerta/ }))
    expect(await screen.findByText(/al menos un filtro/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('eliminar pide confirmación y quita de la lista', async () => {
    mockAuth(CON_TOKEN)
    api.get.mockImplementation((url) => {
      if (url === '/api/busquedas-guardadas') {
        return Promise.resolve({ data: [{ id: 5, nombre: 'Vieja', activa: true, servicios_ids: [] }] })
      }
      return Promise.resolve({ data: [] })
    })
    api.delete.mockResolvedValue({ data: { eliminada: true } })
    renderAlerta()
    expect(await screen.findByText('Vieja')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Eliminar alerta/ }))
    expect(screen.getByRole('dialog', { name: 'Eliminar alerta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/busquedas-guardadas/5', expect.anything()))
    await waitFor(() => expect(screen.queryByText('Vieja')).not.toBeInTheDocument())
  })
})

describe('GuardarAlerta (botón en Buscar)', () => {
  it('sin sesión avisa y lleva a perfil', async () => {
    mockAuth(SIN_TOKEN)
    const { container } = render(<MemoryRouter><GuardarAlerta filtros={{}} campusId={null} /></MemoryRouter>)
    expect(container).not.toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: /Guardar alerta/ }))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('con sesión publica los filtros mapeados', async () => {
    mockAuth(CON_TOKEN)
    api.post.mockResolvedValue({ data: { id: 1 } })
    render(<MemoryRouter><GuardarAlerta filtros={{ min: '300000', servicios: '1' }} campusId={2} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Guardar alerta/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/busquedas-guardadas',
      { precio_min: 300000, precio_max: null, campus_id: 2, tipo: null, servicios_ids: [1] },
      expect.anything()))
  })

  it('sin filtros no postea (toast con guía)', async () => {
    mockAuth(CON_TOKEN)
    const oyente = vi.fn()
    window.addEventListener('alojau:toast', oyente)
    try {
      render(<MemoryRouter><GuardarAlerta filtros={{}} campusId={null} /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: /Guardar alerta/ }))
      await waitFor(() => expect(oyente).toHaveBeenCalled())
      expect(api.post).not.toHaveBeenCalled()
      expect(oyente.mock.calls[0][0].detail.message).toMatch(/al menos un filtro/)
    } finally {
      window.removeEventListener('alojau:toast', oyente)
    }
  })

  it('422 del tope lleva enlace a /alertas en el toast', async () => {
    mockAuth(CON_TOKEN)
    api.post.mockRejectedValue({
      response: { status: 422, data: { detail: 'Has alcanzado el límite de 5 alertas activas.' } },
    })
    const oyente = vi.fn()
    window.addEventListener('alojau:toast', oyente)
    try {
      render(<MemoryRouter><GuardarAlerta filtros={{ min: '300000' }} campusId={null} /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: /Guardar alerta/ }))
      await waitFor(() => expect(oyente).toHaveBeenCalled())
      expect(oyente.mock.calls[0][0].detail.href).toBe('/alertas')
    } finally {
      window.removeEventListener('alojau:toast', oyente)
    }
  })
})
