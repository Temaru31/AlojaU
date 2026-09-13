import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import RenovarModal from './RenovarModal'
import { api } from '../services/api'

vi.mock('../services/api', () => ({
  api: {
    patch: vi.fn(),
  },
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

describe('RenovarModal (PA-01)', () => {
  const mockPub = {
    id: 10,
    titulo: 'Habitación Universitaria Centro',
    fecha_expiracion: '2026-10-01T12:00:00Z',
  }

  it('renderiza fechas actuales y vista previa orientativa', () => {
    render(
      <RenovarModal
        pub={mockPub}
        token="test-token"
        onClose={vi.fn()}
        onRenovada={vi.fn()}
      />
    )

    expect(screen.getByText('Renovar publicación')).toBeInTheDocument()
    expect(screen.getByText('Habitación Universitaria Centro')).toBeInTheDocument()
    expect(screen.getByText('+30 días calendario')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar renovación' })).toBeInTheDocument()
  })

  it('permite cancelar con el botón Cancelar', () => {
    const onClose = vi.fn()
    render(
      <RenovarModal
        pub={mockPub}
        token="test-token"
        onClose={onClose}
        onRenovada={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('al confirmar exitosamente, muestra la nueva fecha confirmada del backend', async () => {
    const onRenovada = vi.fn()
    api.patch.mockResolvedValueOnce({
      data: {
        publicacion_id: 10,
        estado: 'ACTIVO',
        fecha_expiracion_anterior: '2026-10-01T12:00:00Z',
        fecha_expiracion_nueva: '2026-10-31T12:00:00Z',
        dias_agregados: 30,
        mensaje: 'Publicación renovada con éxito por 30 días adicionales',
      },
    })

    render(
      <RenovarModal
        pub={mockPub}
        token="test-token"
        onClose={vi.fn()}
        onRenovada={onRenovada}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar renovación' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/api/publicaciones/10/renovar',
        {},
        { headers: { Authorization: 'Bearer test-token' } }
      )
    })

    expect(await screen.findByText('Publicación renovada con éxito por 30 días adicionales')).toBeInTheDocument()
    expect(screen.getByText('30 días reales')).toBeInTheDocument()
    expect(onRenovada).toHaveBeenCalledWith(expect.objectContaining({
      publicacion_id: 10,
      dias_agregados: 30,
    }))
  })

  it('ante error de red/servidor muestra error y NO presenta fecha renovada confirmada', async () => {
    const onRenovada = vi.fn()
    api.patch.mockRejectedValueOnce(new Error('Network error'))

    render(
      <RenovarModal
        pub={mockPub}
        token="test-token"
        onClose={vi.fn()}
        onRenovada={onRenovada}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar renovación' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Error de red o de servidor/i)).toBeInTheDocument()
    // No debe llamar onRenovada
    expect(onRenovada).not.toHaveBeenCalled()
    // No debe mostrar bloque de éxito ni fecha confirmada
    expect(screen.queryByText('Nueva fecha de vencimiento')).not.toBeInTheDocument()
  })

  it('ante error 403 muestra que no tiene permisos', async () => {
    api.patch.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { detail: 'Solo el dueño de la publicación puede renovarla' },
      },
    })

    render(
      <RenovarModal
        pub={mockPub}
        token="test-token"
        onClose={vi.fn()}
        onRenovada={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar renovación' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/No tienes permisos para renovar esta publicación/i)).toBeInTheDocument()
  })
})
