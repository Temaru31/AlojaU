import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AvatarPerfil from './AvatarPerfil'

describe('AvatarPerfil (M3 sin URL expuesta)', () => {
  it('sin foto muestra iniciales (sin caja de URL)', () => {
    render(<AvatarPerfil perfil={{ nombre_completo: 'Ana Ríos', foto_perfil_url: null }} token="t" onCambio={() => {}} />)
    expect(screen.getByLabelText('Añadir foto de perfil')).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/https:\/\//)).not.toBeInTheDocument()
  })

  it('click abre Action Sheet con Ver/Cambiar/Quitar', () => {
    render(<AvatarPerfil perfil={{ nombre_completo: 'Ana', foto_perfil_url: 'https://x/f.jpg' }} token="t" onCambio={() => {}} />)
    fireEvent.click(screen.getByLabelText('Abrir opciones de foto de perfil'))
    expect(screen.getByText(/Ver foto en tamaño completo/)).toBeInTheDocument()
    expect(screen.getByText(/Cambiar foto/)).toBeInTheDocument()
    expect(screen.getByText(/Quitar foto/)).toBeInTheDocument()
  })

  it('sin foto el sheet no ofrece Ver ni Quitar', () => {
    render(<AvatarPerfil perfil={{ nombre_completo: 'Ana', foto_perfil_url: null }} token="t" onCambio={() => {}} />)
    fireEvent.click(screen.getByLabelText('Añadir foto de perfil'))
    expect(screen.queryByText(/Ver foto/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quitar foto/)).not.toBeInTheDocument()
    expect(screen.getByText(/Cambiar foto/)).toBeInTheDocument()
  })
})
