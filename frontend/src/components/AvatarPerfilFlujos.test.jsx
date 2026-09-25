import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import AvatarPerfil from './AvatarPerfil'
import { api } from '../services/api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const PERFIL = { nombre_completo: 'Ana Ríos', foto_perfil_url: 'https://x/f.jpg' }

describe('AvatarPerfil flujos (honestos, con api mock)', () => {
  it('ver foto abre visor y × lo cierra', () => {
    render(<AvatarPerfil perfil={PERFIL} token="t" onCambio={() => {}} />)
    fireEvent.click(screen.getByLabelText('Abrir opciones de foto de perfil'))
    fireEvent.click(screen.getByText(/Ver foto en tamaño completo/))
    expect(screen.getByLabelText('Foto en tamaño completo')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Cerrar foto'))
    expect(screen.queryByLabelText('Foto en tamaño completo')).not.toBeInTheDocument()
  })

  it('cancelar cierra el sheet sin llamar api', () => {
    const postSpy = vi.spyOn(api, 'post')
    render(<AvatarPerfil perfil={PERFIL} token="t" onCambio={() => {}} />)
    fireEvent.click(screen.getByLabelText('Abrir opciones de foto de perfil'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText(/Cambiar foto/)).not.toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('quitar foto llama DELETE y propaga null', async () => {
    const onCambio = vi.fn()
    vi.spyOn(api, 'delete').mockResolvedValue({ data: { foto_perfil_url: null } })
    render(<AvatarPerfil perfil={PERFIL} token="t" onCambio={onCambio} />)
    fireEvent.click(screen.getByLabelText('Abrir opciones de foto de perfil'))
    fireEvent.click(screen.getByText(/Quitar foto/))
    await waitFor(() => expect(onCambio).toHaveBeenCalledWith(null))
  })

  it('quitar con error muestra alerta sin cerrar (honesto)', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue({ response: { data: { detail: 'Fallo X' } } })
    render(<AvatarPerfil perfil={PERFIL} token="t" onCambio={() => {}} />)
    fireEvent.click(screen.getByLabelText('Abrir opciones de foto de perfil'))
    fireEvent.click(screen.getByText(/Quitar foto/))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Fallo X'))
  })

  it('cambiar con archivo inválido del input no llama api', () => {
    const postSpy = vi.spyOn(api, 'post')
    render(<AvatarPerfil perfil={PERFIL} token="t" onCambio={() => {}} />)
    const input = screen.getByLabelText('Elegir foto de perfil')
    fireEvent.change(input, { target: { files: [] } })
    expect(postSpy).not.toHaveBeenCalled()
  })
})
