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
  canon_mensual: 450000, tipo_inmueble: 'HABITACION_INDEPENDIENTE',
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
})
