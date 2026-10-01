import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import AdminTipos from './AdminTipos'
import { api } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'mock-token-admin' }) }))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const TIPOS = [
  { slug: 'APARTAESTUDIO', nombre_visible: 'Apartaestudio', descripcion_tooltip: 'Integrado', icono: '🏢', esta_activo: true },
  { slug: 'LOFT_VIEJO', nombre_visible: 'Loft', descripcion_tooltip: '', icono: '', esta_activo: false },
]

function mockApi(extra = {}) {
  vi.spyOn(api, 'get').mockImplementation((url) => {
    if (url === '/api/admin/housing-types') return Promise.resolve({ data: [...TIPOS] })
    return Promise.resolve({ data: {} })
  })
  vi.spyOn(api, 'post').mockImplementation(async () => extra.post ?? { data: { slug: 'NUEVO', esta_activo: true } })
  vi.spyOn(api, 'patch').mockImplementation(async () => extra.patch ?? { data: { ...TIPOS[0], esta_activo: false } })
  vi.spyOn(api, 'delete').mockImplementation(async () => {
    if (extra.deleteErr) throw extra.deleteErr
    return { data: {} }
  })
}

describe('AdminTipos (R10 disable lógico)', () => {
  it('lista con badges ACTIVO/INACTIVO y breadcrumbs', async () => {
    mockApi()
    render(<BrowserRouter><AdminTipos /></BrowserRouter>)
    expect(await screen.findByText('APARTAESTUDIO')).toBeInTheDocument()
    expect(screen.getByText('INACTIVO')).toBeInTheDocument()
    expect(screen.getByText('Tipos de vivienda')).toBeInTheDocument()
  })

  it('desactivar llama PATCH con esta_activo=false', async () => {
    mockApi()
    render(<BrowserRouter><AdminTipos /></BrowserRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar APARTAESTUDIO' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/admin/housing-types/APARTAESTUDIO', { esta_activo: false }, expect.anything()))
  })

  it('eliminar con 409 sugiere desactivar (FK RESTRICT)', async () => {
    mockApi({ deleteErr: { response: { status: 409, data: { detail: 'en uso' } } } })
    render(<BrowserRouter><AdminTipos /></BrowserRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar APARTAESTUDIO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminar APARTAESTUDIO' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/desactívalo/))
  })

  it('crear envía slug en mayúsculas', async () => {
    mockApi()
    render(<BrowserRouter><AdminTipos /></BrowserRouter>)
    await screen.findByText('APARTAESTUDIO')
    fireEvent.change(screen.getByLabelText('Slug del nuevo tipo'), { target: { value: 'loft_nuevo' } })
    fireEvent.change(screen.getByLabelText('Nombre visible del nuevo tipo'), { target: { value: 'Loft Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear tipo' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/housing-types',
      expect.objectContaining({ slug: 'LOFT_NUEVO', nombre_visible: 'Loft Nuevo' }),
      expect.anything()))
  })
})
