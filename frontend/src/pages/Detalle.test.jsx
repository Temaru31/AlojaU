import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Detalle from './Detalle'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
// Leaflet no corre en jsdom: se mockean hijos visuales (el scroll/botones se prueban aquí).
vi.mock('../components/MapaZona', () => ({ default: (props) => <div data-testid="mapa" data-aviso={props.aviso ? JSON.stringify(props.aviso) : ''} data-lugar={props.lugar ? JSON.stringify(props.lugar) : ''} /> }))
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
    await waitFor(() => expect(screen.getByRole('link', { name: /Contactar por WhatsApp/ })).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: /Contactar por WhatsApp/ }))
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

  it('Oleada 2: pasa coords del aviso al mapa (modo aviso + deep-link)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, latitud: 2.4451, longitud: -76.6085 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByTestId('mapa')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.aviso).toContain('2.4451')
  })

  it('Oleada 2: sin coords el mapa va en modo campus (aviso vacío)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, latitud: null, longitud: null } })
    renderDetalle()
    await waitFor(() => expect(screen.getByTestId('mapa')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.aviso).toBe('')
  })
})

describe('Detalle 004 sincronización dinámica del mapa', () => {
  const renderDetalleQs = (qs) => render(
    <MemoryRouter initialEntries={[`/publicacion/1${qs}`]}>
      <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
    </MemoryRouter>
  )

  it('con ?campus_id= pide el detalle con ese param y sincroniza el lugar', async () => {
    window.scrollTo = vi.fn()
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: [] })
      return Promise.resolve({
        data: {
          ...pub, latitud: 2.4451, longitud: -76.6085,
          distancia_geodesica_m: 900,
          campus_ref: {
            campus_id: 3, institucion: 'Centro Comercial Campanario', nombre_sede: 'Sede Única',
            latitud: 2.4467, longitud: -76.6014, dist_m: 900, tiempo_pie_min: 15,
          },
        },
      })
    })
    renderDetalleQs('?campus_id=3')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/publicaciones/1?campus_id=3'))
    const mapa = await screen.findByTestId('mapa')
    expect(mapa.dataset.lugar).toContain('Campanario')
    expect(mapa.dataset.lugar).toContain('2.4467')
    expect(screen.getByText(/Distancia a Sede Única/)).toBeInTheDocument()
  })

  it('sin ?campus_id= mantiene el comportamiento legacy (sin lugar, etiqueta genérica)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, distancia_geodesica_m: 320 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Descripción')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.lugar).toBe('')
    expect(screen.getByText('Distancia al campus')).toBeInTheDocument()
  })
})

describe('Detalle 004 distancias honestas', () => {
  const renderDetalleQs = (qs) => render(
    <MemoryRouter initialEntries={[`/publicacion/1${qs}`]}>
      <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
    </MemoryRouter>
  )

  it('ref con dist_m null muestra "No informado" (no hereda otro lugar)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: [] })
      return Promise.resolve({
        data: {
          ...pub, latitud: 2.4451, longitud: -76.6085,
          distancia_geodesica_m: 900,
          campus_ref: {
            campus_id: 5, institucion: 'Terminal de Transportes', nombre_sede: 'Sede Única',
            latitud: 2.4505, longitud: -76.613, dist_m: null, tiempo_pie_min: null,
          },
        },
      })
    })
    renderDetalleQs('?campus_id=5')
    await waitFor(() => expect(screen.getByText('Distancia a Sede Única')).toBeInTheDocument())
    // No hereda los 900 m de otro lugar: no aparece ninguna distancia en el bloque.
    expect(screen.queryByText(/900/)).not.toBeInTheDocument()
  })
})
