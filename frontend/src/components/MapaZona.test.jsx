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
  useMap: () => ({ fitBounds: vi.fn() }),
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
    const osm = screen.getByRole('link', { name: /Abrir ubicación en OpenStreetMap/ })
    // FIX-OSM: coords directas con marcador, nunca /directions con texto.
    expect(osm.getAttribute('href')).toContain('mlat=2.4451')
    expect(osm.getAttribute('href')).toContain('#map=17/2.4451/')
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

  it('sin coords precisas no muestra OSM (solo Google Maps con texto)', () => {
    render(
      <MemoryRouter>
        <MapaZona campus={{ lat: 2.443, lng: -76.606 }} dist_m={null} direccion="Calle 5 #4-70" />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /Cómo llegar en Google Maps/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /OpenStreetMap/ })).not.toBeInTheDocument()
  })

  it('CTA muestra el icono del modo de viaje seleccionado', () => {
    render(
      <MemoryRouter>
        <MapaZona campus={{ lat: 2.443, lng: -76.606 }} aviso={{ lat: 2.4451, lng: -76.6085 }} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /Auto/ }))
    const cta = screen.getByRole('link', { name: /Cómo llegar en Google Maps/ })
    expect(cta.getAttribute('href')).toContain('travelmode=driving')
    // El icono va en span aria-hidden (no cuenta en el nombre accesible).
    expect(cta.textContent).toContain('🚗')
  })
})

describe('MapaZona 004 POIs dinámico', () => {
  const AVISO = { lat: 2.4451, lng: -76.6085 }
  const LUGAR = { lat: 2.4467, lng: -76.6014, nombre: 'Centro Comercial Campanario' }

  it('lugar dinámico precede al campus legacy (2 pines + nombre del lugar)', () => {
    render(
      <MemoryRouter>
        <MapaZona
          campus={{ lat: 2.443, lng: -76.606 }}
          lugar={LUGAR}
          aviso={AVISO}
          dist_m={900}
        />
      </MemoryRouter>
    )
    const markers = screen.getAllByTestId('marker')
    expect(markers.length).toBe(2)
    // El pin de referencia usa las coords del lugar, no las del campus legacy.
    expect(markers[1].dataset.position).toContain('2.4467')
    expect(screen.getByText('Centro Comercial Campanario')).toBeInTheDocument()
    expect(screen.getByTestId('linea-ruta')).toBeInTheDocument()
  })

  it('aviso sin referencia: solo pin de la casa (sin línea ni pin extra)', () => {
    render(
      <MemoryRouter>
        <MapaZona campus={null} aviso={AVISO} dist_m={null} direccion="" />
      </MemoryRouter>
    )
    expect(screen.getAllByTestId('marker').length).toBe(1)
    expect(screen.queryByTestId('linea-ruta')).not.toBeInTheDocument()
  })

  it('GPS denegado llama onGeoError y conserva la ruta por defecto', () => {
    const onGeoError = vi.fn()
    // Sin geolocation en el navegador.
    const geo = navigator.geolocation
    // @ts-expect-error simulación jsdom
    delete navigator.geolocation
    try {
      render(
        <MemoryRouter>
          <MapaZona campus={{ lat: 2.443, lng: -76.606 }} aviso={AVISO} onGeoError={onGeoError} />
        </MemoryRouter>
      )
      fireEvent.click(screen.getByRole('button', { name: /desde mi ubicación/ }))
      expect(onGeoError).toHaveBeenCalledTimes(1)
      // La ruta por defecto (origen = campus) sigue disponible.
      expect(screen.getByRole('link', { name: /Cómo llegar en Google Maps/ }).getAttribute('href')).toContain('origin=2.443')
    } finally {
      Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    }
  })
})
