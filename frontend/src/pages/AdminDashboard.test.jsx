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
    if (url === '/api/admin/auditoria') return Promise.resolve({
      data: {
        items: [
          { id: 1, evento: 'APPROVED', detalle: 'Cambio a ACTIVO por admin', publicacion_id: 7, creado_en: '2026-09-23T22:14:00-05:00' },
          { id: 2, evento: 'SETTINGS', detalle: 'dias_vigencia_publicacion: 30 -> 31', publicacion_id: null, creado_en: '2026-09-24T10:00:00-05:00' },
        ],
        total: 2,
      },
    })
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

  it('M1 KPIs con usuarios + tooltips y badge PENDIENTE veraz', async () => {
    mockApi()
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    expect(await screen.findByText('Usuarios')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Ajustes del Sistema/ }))
    await waitFor(() => expect(screen.getByText('Aprobación automática a verificados')).toBeInTheDocument())
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument()
  })

  it('M4 pestaña Historial: etiquetas humanas + fecha 12h + paginación', async () => {
    mockApi()
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /Historial/ }))
    // Enum crudo nunca visible; fecha en 12h.
    expect(await screen.findByText('Aprobada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste del sistema')).toBeInTheDocument()
    expect(screen.queryByText('APPROVED')).not.toBeInTheDocument()
    expect(screen.getByText(/23 Sep 2026, 10:14 PM/)).toBeInTheDocument()
    // M1 enriquecido: mensaje legible + link clickeable (puede haber 2 nodos con "aviso #7").
    expect(screen.getAllByText(/aviso #7/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /aviso #7/ })).toBeInTheDocument()
    expect(screen.getByText(/Página 1 de 1 \(2\)/)).toBeInTheDocument()
  })

  it('M1 breadcrumbs Inicio › Panel Admin + badge reportes + tooltip métricas', async () => {
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/admin/metricas') {
        return Promise.resolve({ data: {
          total_publicaciones: 16, activas: 13, pendientes: 2,
          reportes_activos: 5, reportes_pendientes: 3, inmuebles_con_reportes: 2,
          arrendadores_verificados: 1, total_usuarios: 3,
        } })
      }
      if (url === '/api/admin/pendientes') return Promise.resolve({ data: { items: [], total: 0 } })
      if (url === '/api/admin/auditoria') return Promise.resolve({ data: { items: [], total: 0 } })
      if (url === '/api/admin/automation/settings') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    render(<BrowserRouter><AdminDashboard /></BrowserRouter>)
    // Breadcrumb desktop
    expect(await screen.findByText('Panel Admin')).toBeInTheDocument()
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    // Tarjeta principal pendientes + tooltip diferencia denuncias vs inmuebles
    expect((await screen.findAllByText('Pendientes de revisión')).length).toBeGreaterThanOrEqual(1)
    // Badge rojo prominente con reportes_pendientes
    expect(screen.getByLabelText(/3 reportes pendientes/)).toBeInTheDocument()
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
