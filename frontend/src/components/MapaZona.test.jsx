import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MapaZona, { buildGoogleMapsDirUrl } from './MapaZona'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }) => <div data-testid="map" data-center={JSON.stringify(center)}>{children}</div>,
  TileLayer: () => null,
  Circle: (p) => <div data-testid="circle" data-radius={p.radius} data-center={JSON.stringify(p.center)} />,
  Marker: ({ children, position }) => <div data-testid="marker" data-position={JSON.stringify(position)}>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => <div data-testid="linea-ruta" />,
}))

afterEach(cleanup)

describe('MapaZona Oleada 2', () => {
  it('buildGoogleMapsDirUrl genera deep-link universal sin API key', () => {
    const url = buildGoogleMapsDirUrl({
      origin: '2.443,-76.606',
      destination: '2.4451,-76.6085',
      travelmode: 'walking',
    })
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true)
    expect(url).toContain('destination=2.4451')
    expect(url).toContain('travelmode=walking')
    expect(url).not.toContain('key=')
  })

  it('modo aviso: centra en el inmueble con radio 150m + línea al campus + deep-link', () => {
    render(
      <MemoryRouter>
        <MapaZona
          zona="Tulcán"
          campus={{ lat: 2.443, lng: -76.606 }}
          dist_m={320}
          aviso={{ lat: 2.4451, lng: -76.6085 }}
          direccion="Calle 5 #4-70"
          titulo="Habitación prueba"
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('map').dataset.center).toContain('2.4451')
    expect(screen.getByTestId('circle').dataset.radius).toBe('150')
    expect(screen.getByTestId('linea-ruta')).toBeInTheDocument()
    expect(screen.getByText(/Ubicación aproximada/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Cómo llegar en Google Maps/ })
    expect(link.getAttribute('href')).toContain('2.4451')
    expect(screen.getByRole('link', { name: 'Abrir en OSM' })).toBeInTheDocument()
  })

  it('cambiar modo de viaje actualiza el deep-link', () => {
    render(
      <MemoryRouter>
        <MapaZona campus={{ lat: 2.443, lng: -76.606 }} aviso={{ lat: 2.4451, lng: -76.6085 }} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bus' }))
    expect(screen.getByRole('link', { name: /Cómo llegar en Google Maps/ }).getAttribute('href')).toContain('travelmode=transit')
  })

  it('modo campus legacy: radio 400m sin línea ni pin de aviso', () => {
    render(
      <MemoryRouter>
        <MapaZona zona="Tulcán" campus={{ lat: 2.443, lng: -76.606 }} dist_m={null} direccion="" />
      </MemoryRouter>
    )
    expect(screen.getByTestId('circle').dataset.radius).toBe('400')
    expect(screen.queryByTestId('linea-ruta')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Cómo llegar/ })).not.toBeInTheDocument()
    expect(screen.getByText(/mapa referencial del campus/)).toBeInTheDocument()
  })
})
