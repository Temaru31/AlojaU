import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import { api } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'mock-token-admin' }) }))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const SETTINGS = [
  { clave: 'dias_vigencia_publicacion', valor: '30', tipo: 'int', descripcion: 'Días de vigencia' },
  { clave: 'max_reportes_para_pausa_automatica', valor: '3', tipo: 'int', descripcion: 'Umbral' },
  { clave: 'auto_aprobar_arrendadores_verificados', valor: 'false', tipo: 'bool', descripcion: 'Auto' },
]

function mockApi() {
  vi.spyOn(api, 'get').mockImplementation((url) => {
    if (url === '/api/admin/automation/settings') return Promise.resolve({ data: SETTINGS })
    if (url === '/api/admin/metricas') return Promise.resolve({ data: {} })
    if (url === '/api/admin/pendientes') return Promise.resolve({ data: { items: [], total: 0 } })
    return Promise.resolve({ data: {} })
  })
}

describe('AdminDashboard - Ajustes del Sistema', () => {
  it('muestra pestañas Moderación y Ajustes', async () => {
    mockApi()
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    expect(screen.getByRole('tab', { name: /Moderación/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Ajustes del Sistema/ })).toBeInTheDocument()
  })

  it('pestaña Ajustes lista settings con numéricos y switch', async () => {
    mockApi()
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /Ajustes del Sistema/ }))
    await waitFor(() => expect(screen.getByText('Días de vigencia por aviso')).toBeInTheDocument())
    expect(screen.getByText(/antes de que una publicación pase a expirada/)).toBeInTheDocument()
    expect(screen.getByText('Límite de reportes para pausa')).toBeInTheDocument()
    expect(screen.getByLabelText('Días de vigencia por aviso')).toHaveValue(30)
    expect(screen.getByRole('switch', { name: 'Aprobación automática a verificados' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('dias_vigencia_publicacion')).not.toBeInTheDocument()
  })

  it('switch cambia y Guardar llama PATCH', async () => {
    mockApi()
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ...SETTINGS[2], valor: 'true' } })
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /Ajustes del Sistema/ }))
    await waitFor(() => expect(screen.getByText('Días de vigencia por aviso')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('switch', { name: 'Aprobación automática a verificados' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar Aprobación automática/ }))
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith(
      '/api/admin/automation/settings/auto_aprobar_arrendadores_verificados',
      { valor: 'true' },
      expect.anything(),
    ))
  })
})
