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
    // R1: sin botón de auto-verificación ni bloque huérfano de admin; la vía es Telegram
    expect(screen.queryByRole('button', { name: /Verificar teléfono/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Un administrador debe verificar tu línea/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abrir Bot de Telegram/ })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('tab', { name: /Mis Publicaciones/ }))
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

  it('M2 Google: sin formulario de contraseña, con tarjeta informativa', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, auth_provider: 'google', email_verificado: true })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Seguridad/ }))
    expect(screen.queryByLabelText(/Contraseña actual/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actualizar contraseña/ })).not.toBeInTheDocument()
    expect(screen.getByText(/inicio de sesión seguro con Google/i)).toBeInTheDocument()
  })

  it('M2 password: con proveedor local sí muestra el formulario', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, auth_provider: 'password' })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Seguridad/ }))
    expect(screen.getByLabelText(/Contraseña actual/i)).toBeInTheDocument()
  })

  it('M2 danger zone: botón bloqueado hasta que el correo coincide letra por letra', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, auth_provider: 'google' })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Seguridad/ }))
    fireEvent.click(screen.getByRole('button', { name: /Eliminar mi cuenta/ }))
    const confirmar = screen.getByRole('button', { name: /eliminar mi cuenta/i })
    expect(confirmar).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Correo de confirmación/i), { target: { value: 'otro@x.co' } })
    expect(confirmar).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Correo de confirmación/i), { target: { value: 'arrendador@alojau.com' } })
    expect(confirmar).not.toBeDisabled()
    // Google: sin campo de contraseña actual.
    expect(screen.queryByLabelText(/Contraseña actual para eliminar/i)).not.toBeInTheDocument()
  })

  it('M3 muestra insignia verde de correo verificado en Datos', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, email_verificado: true })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    // M3 gamificado: el badge + la checklist (con peso 20%) contienen el texto.
    expect(screen.getAllByText(/✓ Correo verificado/).length).toBeGreaterThanOrEqual(1)
  })

  it('M2 revocar-todas exige 2 pasos y luego limpia la sesión', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, auth_provider: 'password' })
    vi.spyOn(api, 'post').mockResolvedValue({ data: { mensaje: 'ok', revocadas: 2 } })
    const replaceSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { replace: replaceSpy }, writable: true })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /Seguridad/ }))
    // Primer clic solo arma la confirmación.
    fireEvent.click(screen.getByRole('button', { name: /todos los dispositivos/ }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Confirmar cierre/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cierre/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/sesiones/revocar-todas', {}, expect.anything()))
    await waitFor(() => expect(localStorage.getItem('alojau_token')).toBeNull())
    expect(replaceSpy).toHaveBeenCalledWith('/')
  })

  it('M2 tags no guardan al clic: van con Guardar cambios', async () => {
    const user = userEvent.setup()
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, preferencias: {} })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: { ...PERFIL_BASE, preferencias: {} } })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    // Clic en tag (F1 chips ilustrados, filtros.*): sin PATCH, con aviso de sin guardar.
    await user.click(screen.getByRole('button', { name: /Acepto mascotas/ }))
    expect(patchSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/sin guardar/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))
    await waitFor(() => expect(patchSpy).toHaveBeenCalledOnce())
    expect(patchSpy.mock.calls[0][1]).toMatchObject({ preferencias: { 'filtros.mascotas': true } })
  })

  it('tabs Entrar/Crear cuenta conmutan sin token', async () => {
    mockPerfil()
    vi.spyOn(api, 'post').mockImplementation((url) => {
      if (url === '/api/auth/login') return Promise.resolve({ data: { access_token: 'tok-nuevo' } })
      return Promise.resolve({ data: {} })
    })
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    expect(screen.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }))
    expect(screen.getByRole('tab', { name: 'Crear cuenta' })).toHaveAttribute('aria-selected', 'true')
  })

  it('checklist refleja foto/tags/bio y hash inválido cae a datos', async () => {
    window.location.hash = '#inexistente'
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({
      ...PERFIL_BASE,
      bio: 'Hola soy estudiante',
      foto_perfil_url: 'https://x.com/foto.jpg',
      email_verificado: true,
      telefono_verificado: true,
      preferencias: { 'filtros.mascotas': true },
    })
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    expect(screen.getByText(/Completa tu perfil \(100%\)/)).toBeInTheDocument()
  })

  it('R1 teléfono verificado bloqueado con ✏️; editar lo habilita', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, telefono_verificado: true })
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('3001234567')).toBeInTheDocument())
    const input = screen.getByLabelText(/Teléfono WhatsApp/i, { selector: 'input' })
    expect(input).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Editar número de teléfono/ }))
    expect(input).not.toBeDisabled()
  })

  it('R1 correo sin verificar muestra OTP en Datos (no en Mis Publicaciones)', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, email_verificado: false })
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Enviar código/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Mis Publicaciones/ }))
    expect(screen.queryByRole('button', { name: /Enviar código/ })).not.toBeInTheDocument()
  })

  it('R3 confianza pendiente muestra accesos directos accionables', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    mockPerfil({ ...PERFIL_BASE, email_verificado: false })
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    await waitFor(() => expect(screen.getByDisplayValue('arrendador@alojau.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /Nivel de Confianza/ }))
    expect(screen.getByText(/Súbela al 100%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Verificar mi correo/ })).toBeInTheDocument()
  })

  it('helpers de teléfono CO', () => {
    expect(telefonoALocal('573001234567')).toBe('3001234567')
    expect(telefonoALocal('+573001234567')).toBe('3001234567')
    expect(telefonoALocal('3001234567')).toBe('3001234567')
    expect(telefonoAE164('3001234567')).toBe('+573001234567')
    expect(telefonoAE164('+573001234567')).toBe('+573001234567')
  })
})
