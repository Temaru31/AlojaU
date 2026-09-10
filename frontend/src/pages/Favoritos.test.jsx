import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Favoritos from './Favoritos'
import { FavoritosProvider } from '../contexts/FavoritosContext'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

const renderWithProvider = (initialFavorites = []) => {
  if (initialFavorites.length > 0) {
    localStorage.setItem('favoritos', JSON.stringify(initialFavorites))
  }
  return render(
    <MemoryRouter>
      <FavoritosProvider>
        <Favoritos />
      </FavoritosProvider>
    </MemoryRouter>
  )
}

describe('Página de Favoritos (HU Estudiante)', () => {
  it('cuando no hay favoritos guardados, muestra estado vacío que invita a explorar', () => {
    renderWithProvider([])
    expect(screen.getByText(/No tienes favoritos guardados/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Explorar publicaciones/i })).toHaveAttribute('href', '/')
  })

  it('cuando una publicación favorita es ACTIVA y vigente, se presenta disponible sin badge de no vigencia', async () => {
    const ahora = new Date()
    const fechaFutura = new Date(ahora.getTime() + 15 * 86_400_000).toISOString()

    api.get.mockResolvedValueOnce({
      data: {
        id: 10,
        titulo: 'Habitación Universitaria Tulcán',
        tipo_inmueble: 'HABITACION_INDEPENDIENTE',
        zona_nombre: 'Tulcán',
        canon_mensual: 450000,
        estado: 'ACTIVO',
        fecha_expiracion: fechaFutura,
        whatsapp_url: 'https://wa.me/573001234567',
        telefono_whatsapp: '+573001234567',
        fotos: ['https://res.cloudinary.com/demo/image/upload/v1/alojau/1.jpg'],
        indice_confianza: 90,
      },
    })

    renderWithProvider([10])

    expect(await screen.findByText('Habitación Universitaria Tulcán')).toBeInTheDocument()
    expect(screen.getByText('Habitación independiente')).toBeInTheDocument()
    expect(screen.getByText('$450.000 COP/mes')).toBeInTheDocument()

    // No debe tener badge "No vigente"
    expect(screen.queryByText('No vigente')).not.toBeInTheDocument()

    // Debe tener enlace a WhatsApp
    const waLink = screen.getByRole('link', { name: /Contactar por WhatsApp/i })
    expect(waLink).toHaveAttribute('href', 'https://wa.me/573001234567')
  })

  it('cuando una publicación favorita está vencida o no es ACTIVA, muestra badge rojo "No vigente" y no permite WhatsApp', async () => {
    const ahora = new Date()
    const fechaPasada = new Date(ahora.getTime() - 3 * 86_400_000).toISOString()

    api.get.mockResolvedValueOnce({
      data: {
        id: 20,
        titulo: 'Apartaestudio Vencido Centro',
        tipo_inmueble: 'APARTAESTUDIO',
        zona_nombre: 'Centro',
        canon_mensual: 600000,
        estado: 'EXPIRADO',
        fecha_expiracion: fechaPasada,
        whatsapp_url: 'https://wa.me/573009999999',
        fotos: [],
      },
    })

    renderWithProvider([20])

    expect(await screen.findByText('Apartaestudio Vencido Centro')).toBeInTheDocument()

    // Criterio de aceptación: muestra badge rojo con el texto "No vigente"
    const badgeNoVigente = screen.getByText('No vigente')
    expect(badgeNoVigente).toBeInTheDocument()
    expect(badgeNoVigente).toHaveClass('bg-red-600')

    // Criterio: no se presenta como disponible para contacto mediante WhatsApp
    expect(screen.queryByRole('link', { name: /Contactar por WhatsApp/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Contacto por WhatsApp no disponible/i)).toBeInTheDocument()
  })

  it('cuando una publicación favorita no existe en el backend (404), conserva referencia visible marcada como "No vigente"', async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 404, data: { detail: 'Publicación no encontrada' } },
    })

    renderWithProvider([99])

    expect(await screen.findByText('Publicación #99')).toBeInTheDocument()
    expect(screen.getByText('No vigente')).toBeInTheDocument()
    expect(screen.getByText(/Aviso no disponible/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Contactar por WhatsApp/i })).not.toBeInTheDocument()
  })

  it('cuando el usuario selecciona "Quitar", se elimina únicamente ese favorito', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/publicaciones/1') {
        return Promise.resolve({
          data: { id: 1, titulo: 'Vivienda 1', estado: 'ACTIVO', canon_mensual: 300000 },
        })
      }
      if (url === '/api/publicaciones/2') {
        return Promise.resolve({
          data: { id: 2, titulo: 'Vivienda 2', estado: 'ACTIVO', canon_mensual: 350000 },
        })
      }
      return Promise.reject(new Error('Not found'))
    })

    renderWithProvider([1, 2])

    expect(await screen.findByText('Vivienda 1')).toBeInTheDocument()
    expect(screen.getByText('Vivienda 2')).toBeInTheDocument()

    // Quitar Vivienda 1
    const card1 = screen.getByText('Vivienda 1').closest('article')
    const btnQuitar = within(card1).getByRole('button', { name: 'Quitar' })
    fireEvent.click(btnQuitar)

    await waitFor(() => {
      expect(screen.queryByText('Vivienda 1')).not.toBeInTheDocument()
    })

    // Vivienda 2 sigue presente
    expect(screen.getByText('Vivienda 2')).toBeInTheDocument()

    // localStorage actualizado
    const stored = JSON.parse(localStorage.getItem('favoritos'))
    expect(stored.some((f) => f.publicacionId === 1)).toBe(false)
    expect(stored.some((f) => f.publicacionId === 2)).toBe(true)
  })

  it('cuando el usuario selecciona "Limpiar favoritos", se eliminan todos los favoritos', async () => {
    window.confirm = vi.fn().mockReturnValue(true)

    api.get.mockResolvedValueOnce({
      data: { id: 5, titulo: 'Casa Estudiantil 5', estado: 'ACTIVO' },
    })

    renderWithProvider([5])

    expect(await screen.findByText('Casa Estudiantil 5')).toBeInTheDocument()

    const btnLimpiar = screen.getByRole('button', { name: /Limpiar favoritos/i })
    fireEvent.click(btnLimpiar)

    expect(window.confirm).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByText(/No tienes favoritos guardados/i)).toBeInTheDocument()
    })

    const stored = JSON.parse(localStorage.getItem('favoritos') || '[]')
    expect(stored).toHaveLength(0)
  })
})
