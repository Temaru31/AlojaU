import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Detalle from './Detalle'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
// Leaflet no corre en jsdom: se mockean hijos visuales (el scroll/botones se prueban aquí).
vi.mock('../components/MapaZona', () => ({ default: () => <div data-testid="mapa" /> }))
vi.mock('../components/GaleriaFotos', () => ({ default: () => <div data-testid="galeria" /> }))
vi.mock('../components/IndiceConfianza', () => ({ default: () => <div data-testid="indice" /> }))
vi.mock('../components/ReportarModal', () => ({ default: () => <div data-testid="reportar" /> }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const pub = {
  id: 1, titulo: 'Habitación cerca Tulcán', estado: 'ACTIVO',
  canon_mensual: 450000, deposito_requerido: 200000,
  descripcion: 'Habitación amplia con baño privado y servicios incluidos cerca a la Facultad.',
  tipo_inmueble: 'HABITACION_INDEPENDIENTE',
  zona_nombre: 'Tulcán', fotos: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'],
  telefono_whatsapp: '573001234567',
}

const renderDetalle = () => render(
  <MemoryRouter initialEntries={['/publicacion/1']}>
    <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
  </MemoryRouter>
)

describe('Detalle UX', () => {
  it('al montar hace scroll al tope (fotos/título, no mapa)', async () => {
    const scrollSpy = vi.fn()
    window.scrollTo = scrollSpy
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    // Título aparece en breadcrumb + h1: basta con que esté visible
    await waitFor(() => expect(screen.getAllByText('Habitación cerca Tulcán').length).toBeGreaterThan(0))
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })

  it('muestra Reportar en cabecera y junto al contacto (no enlace gris bajo mapa)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getAllByText('Habitación cerca Tulcán').length).toBeGreaterThan(0))
    // Cabecera: botón secundario visible junto a favoritos/comparar
    expect(screen.getByRole('button', { name: 'Reportar este aviso' })).toBeInTheDocument()
    // Tarjeta contacto: enlace legible con pregunta
    expect(screen.getByRole('button', { name: /¿Hay algún problema con este anuncio\?/ })).toBeInTheDocument()
  })

  it('P-01: renderiza descripción + total primer mes + tipo humanizado', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Descripción')).toBeInTheDocument())
    expect(screen.getByText(/Habitación amplia con baño privado/)).toBeInTheDocument()
    expect(screen.getByText('Contrato y estadía')).toBeInTheDocument()
    expect(screen.getAllByText('Habitación independiente').length).toBeGreaterThan(0)
    // 450.000 + 200.000 = 650.000 (aparece en resumen y en tabla contrato)
    expect(screen.getByText(/Total primer mes/)).toBeInTheDocument()
    expect(screen.getAllByText(/650\.000/).length).toBeGreaterThan(0)
  })

  it('P-01: depósito 0 muestra "Sin depósito" y null muestra "no informado"', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, deposito_requerido: 0 } })
    const { unmount } = renderDetalle()
    await waitFor(() => expect(screen.getAllByText('Sin depósito').length).toBeGreaterThan(0))
    unmount(); cleanup()
    api.get.mockResolvedValue({ data: { ...pub, deposito_requerido: null, deposito: null } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/Depósito no informado/)).toBeInTheDocument())
  })

  it('P-04: clic en WhatsApp registra contacto + copiar número', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    const { default: userEvent } = await import('@testing-library/user-event')
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: 'WhatsApp' }))
    await waitFor(() => expect(screen.getByText(/Ya contactaste este aviso/)).toBeInTheDocument())
    const guardados = JSON.parse(localStorage.getItem('alojau_contactos') || '[]')
    expect(guardados.some(c => c.id === 1)).toBe(true)
    expect(screen.getByRole('button', { name: /Copiar número/ })).toBeInTheDocument()
  })

  it('distingue 404 de error de red con Reintentar', async () => {
    window.scrollTo = vi.fn()
    api.get.mockRejectedValue({ response: { status: 500 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/No se pudo cargar la publicación/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
