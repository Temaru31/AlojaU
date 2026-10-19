import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PreferenciasRoomie from './PreferenciasRoomie'
import * as apiModule from '../services/api'

describe('PreferenciasRoomie component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(apiModule, 'getEnumsPreferencias').mockResolvedValue({
      data: {
        enums: [],
      },
    })
  })

  it('renderiza las 5 dimensiones del perfil de convivencia', async () => {
    render(<PreferenciasRoomie token="test-token" preferencias={{}} />)

    await waitFor(() => {
      expect(screen.getByText(/1\. Higiene y orden/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/2\. Solvencia económica/i)).toBeInTheDocument()
    expect(screen.getByText(/3\. Personalidad y resolución/i)).toBeInTheDocument()
    expect(screen.getByText(/4\. Estilo de vida y horarios/i)).toBeInTheDocument()
    expect(screen.getByText(/5\. Normas de invitados y mascotas/i)).toBeInTheDocument()
  })

  it('permite cambiar opciones y habilita el botón de guardar', async () => {
    render(<PreferenciasRoomie token="test-token" preferencias={{}} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Entre semana/i })).toBeInTheDocument()
    })

    const btnEntreSemana = screen.getByRole('button', { name: /Entre semana/i })
    fireEvent.click(btnEntreSemana)

    // Se detectan cambios sin guardar
    expect(screen.getByText(/Tienes cambios sin guardar/i)).toBeInTheDocument()

    const btnGuardar = screen.getByRole('button', { name: /Guardar preferencias de roomie/i })
    expect(btnGuardar).not.toBeDisabled()
  })

  it('valida la regla del PDF: muestra advertencia si solo se selecciona 1 defecto', async () => {
    render(<PreferenciasRoomie token="test-token" preferencias={{}} />)

    // Clic en 1 defecto
    const btnImpaciente = screen.getByRole('button', { name: /Impaciente/i })
    fireEvent.click(btnImpaciente)

    expect(
      screen.getByText(/Debes seleccionar al menos 2 defectos o áreas de mejora/i),
    ).toBeInTheDocument()

    // Clic en segundo defecto para corregir
    const btnMalhumorado = screen.getByRole('button', { name: /Malhumorad@/i })
    fireEvent.click(btnMalhumorado)

    // El error debe desaparecer
    expect(
      screen.queryByText(/Debes seleccionar al menos 2 defectos o áreas de mejora/i),
    ).not.toBeInTheDocument()
  })

  it('guarda exitosamente y llama al callback onGuardado', async () => {
    const guardarSpy = vi
      .spyOn(apiModule, 'guardarPreferenciasUsuario')
      .mockResolvedValueOnce({ data: { ok: true } })
    const onGuardadoMock = vi.fn()

    render(
      <PreferenciasRoomie
        token="token-abc"
        preferencias={{}}
        onGuardado={onGuardadoMock}
      />,
    )

    // Seleccionamos puntualidad en pagos (Sí, siempre)
    const btnPuntual = screen.getByRole('button', { name: /Sí, siempre/i })
    fireEvent.click(btnPuntual)

    const btnGuardar = screen.getByRole('button', { name: /Guardar preferencias de roomie/i })
    fireEvent.click(btnGuardar)

    await waitFor(() => {
      expect(guardarSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'roomie.pagos_puntual': true,
        }),
        'token-abc',
      )
      expect(onGuardadoMock).toHaveBeenCalled()
    })
  })
})
