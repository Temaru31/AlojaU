import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MapPicker from './MapPicker'
import * as geocode from '../utils/geocode'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="picker-map">{children}</div>,
  TileLayer: () => null,
  // eslint-disable-next-line react/prop-types
  Marker: ({ position }) => <div data-testid="picker-marker" data-position={JSON.stringify(position)} />,
  useMapEvents: () => null,
}))

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => {
  vi.spyOn(geocode, 'reverseGeocode').mockResolvedValue(null)
})

describe('MapPicker Oleada 2', () => {
  it('sin punto pide clic y no muestra marcador', () => {
    render(<MapPicker lat="" lng="" onChange={() => {}} onAddressSuggestion={() => {}} />)
    expect(screen.getByTestId('picker-map')).toBeInTheDocument()
    expect(screen.queryByTestId('picker-marker')).not.toBeInTheDocument()
    expect(screen.getByText(/Clic en el mapa para ubicar/)).toBeInTheDocument()
  })

  it('con punto muestra marcador y coords', () => {
    render(<MapPicker lat={2.4451} lng={-76.6085} onChange={() => {}} onAddressSuggestion={() => {}} />)
    expect(screen.getByTestId('picker-marker').dataset.position).toContain('2.4451')
    expect(screen.getByText(/Pin: 2.44510/)).toBeInTheDocument()
  })

  it('botón mi ubicación llama onChange con coords del navegador', () => {
    const onChange = vi.fn()
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 2.45, longitude: -76.61 } }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<MapPicker lat="" lng="" onChange={onChange} onAddressSuggestion={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Usar mi ubicación/ }))
    expect(onChange).toHaveBeenCalledWith(2.45, -76.61)
    vi.unstubAllGlobals()
  })
})
