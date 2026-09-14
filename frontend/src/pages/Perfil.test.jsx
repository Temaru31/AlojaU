import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Perfil, { telefonoALocal, telefonoAE164 } from './Perfil'
import { api } from '../services/api'

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.location.hash = ''
  vi.restoreAllMocks()
})

const PERFIL_BASE = {
  id: 1,
  email: 'arrendador@alojau.com',
  nombre_completo: 'Arrendador Demo',
  telefono_whatsapp: '573001234567',
  telefono_verificado: false,
  rol: 'ARRENDADOR',
}

function mockPerfil(data = PERFIL_BASE) {
  vi.spyOn(api, 'get').mockImplementation((url) => {
    if (url === '/api/publicaciones/mias') return Promise.resolve({ data: { total: 0 } })
    return Promise.resolve({ data })
  })
}

describe('Perfil - Perfil verificable + confianza clara', () => {
  it('muestra inicio de sesión si no hay token (sin credenciales demo expuestas)', () => {
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    expect(screen.getByText(/Debes iniciar sesión/i)).toBeInTheDocument()
    // D-20: ni credenciales ni mock-token visibles en UI
    expect(screen.queryByText(/Usar mock-token-arrendador/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/arrendador@alojau\.com/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/AlojaU123/i)).not.toBeInTheDocument()
  })

  it('carga y muestra perfil con teléfono sin verificar (0 pts)', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument()
    })
    // El correo vive una sola vez (campo del formulario, sin duplicar en el resumen).
    expect(screen.queryByText('arrendador@alojau.com')).not.toBeInTheDocument()
    expect(screen.getByText(/Sin verificar \(0 pts\)/i)).toBeInTheDocument()
    // OLA2-M4: sin botón de auto-verificación; la verificación la otorga un administrador
    expect(screen.queryByRole('button', { name: /Verificar teléfono/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Un administrador debe verificar tu línea/i)).toBeInTheDocument()
  })

  it('al guardar NO envía telefono_verificado al backend (solo-lectura OLA2-M4)', async () => {
    const user = userEvent.setup()
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: PERFIL_BASE })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Sin verificar \(0 pts\)/i)).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /Guardar cambios/i })
    await user.click(saveBtn)

    expect(patchSpy).toHaveBeenCalledOnce()
    const sentBody = patchSpy.mock.calls[0][1]
    expect(sentBody).not.toHaveProperty('telefono_verificado')
  })

  it('rol ADMIN sin botón aislado (acceso unificado en el Navbar)', async () => {
    localStorage.setItem('alojau_token', 'mock-token-admin')
    mockPerfil({
      id: 2, email: 'admin@alojau.com', nombre_completo: 'Admin AlojaU',
      telefono_whatsapp: '573009999999', telefono_verificado: true, rol: 'ADMIN',
    })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => expect(screen.getByDisplayValue('admin@alojau.com')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /Panel Admin/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Modo Administrador Maestro/)).not.toBeInTheDocument()
  })

  it('pestañas con hash: #seguridad muestra fortaleza y bloquea envío débil', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Seguridad/ }))
    expect(window.location.hash).toBe('#seguridad')
    expect(screen.getByText(/Mínimo 8 caracteres/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Actualizar contraseña/ })).toBeDisabled()
  })

  it('pestaña confianza muestra los 5 factores una sola vez', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Confianza/ }))
    expect(screen.getAllByText(/Completitud de oferta/).length).toBe(1)
    expect(screen.getByText(/Sin reportes activos/)).toBeInTheDocument()
  })

  it('pestaña avisos enlaza a mis-publicaciones y favoritos', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Avisos/ }))
    expect(screen.getByRole('link', { name: /Mis publicaciones/ })).toHaveAttribute('href', '/mis-publicaciones')
    expect(screen.getByRole('link', { name: /Favoritos/ })).toHaveAttribute('href', '/favoritos')
  })

  it('indicativo +57 encajonado: edita local y guarda en E.164', async () => {
    const user = userEvent.setup()
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil()
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: PERFIL_BASE })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('3001234567')).toBeInTheDocument()
    })
    expect(screen.getByText('+57 🇨🇴')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))
    expect(patchSpy).toHaveBeenCalledOnce()
    expect(patchSpy.mock.calls[0][1]).toMatchObject({ telefono_whatsapp: '+573001234567' })
  })

  it('helpers de teléfono CO', () => {
    expect(telefonoALocal('573001234567')).toBe('3001234567')
    expect(telefonoALocal('+573001234567')).toBe('3001234567')
    expect(telefonoALocal('3001234567')).toBe('3001234567')
    expect(telefonoAE164('3001234567')).toBe('+573001234567')
    expect(telefonoAE164('+573001234567')).toBe('+573001234567')
  })
})
