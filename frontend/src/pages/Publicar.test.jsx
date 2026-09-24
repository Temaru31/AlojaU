import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Publicar from './Publicar'
import { api } from '../services/api'
import { AuthProvider } from '../contexts/AuthContext'
import { signInWithGoogle, POST_LOGIN_REDIRECT_KEY } from '../services/supabaseClient'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../services/supabaseClient', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, signInWithGoogle: vi.fn() }
})

// Hijos pesados fuera del foco: se simula su contrato (onUrls/onChange) para
// verificar la lógica propia de Publicar (login, validación, payload, errores).
vi.mock('../components/UploadFotos', () => ({
  default: ({ onUrls }) => (
    <button
      type="button"
      data-testid="mock-fotos"
      onClick={() => onUrls(['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg'])}
    >
      mock-fotos
    </button>
  ),
}))

vi.mock('../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" data-testid="mock-mapa" onClick={() => onChange(2.445, -76.61)}>
      mock-mapa
    </button>
  ),
}))

const TOKEN = 'tok-arrendador'
const CREATED = {
  data: { id: 99, estado: 'PENDIENTE', mensaje: 'Enviada a revisión', indice_confianza: 85, advertencia: 'Informativo' },
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: [] })
})

afterEach(() => cleanup())

const renderPage = () => render(<MemoryRouter><Publicar /></MemoryRouter>)

const tituloSel = () => screen.getByPlaceholderText('Ej: Habitacion amoblada cerca al Tulcan')
const descSel = () => screen.getByPlaceholderText(/Amoblada, baño privado/)
const canonSel = () => screen.getByPlaceholderText('450000')
const dirSel = () => screen.getByPlaceholderText('No compartas tu direccion exacta')
const reglasSel = () => screen.getByPlaceholderText('Describe las reglas de convivencia...')

// Formulario válido mínimo (HU-005: título 10+, descripción 20+, canon>0,
// dirección/reglas 10+; servicios [1], 3 fotos y zona 3 ya vienen por defecto).
const fillValid = () => {
  fireEvent.change(tituloSel(), { target: { value: 'Habitación de prueba con título largo' } })
  fireEvent.change(descSel(), { target: { value: 'Descripción con más de veinte caracteres válidos' } })
  fireEvent.change(canonSel(), { target: { value: '450000' } })
  fireEvent.change(dirSel(), { target: { value: 'Calle 5 # 4-70 referencia' } })
  fireEvent.change(reglasSel(), { target: { value: 'No mascotas, visitas hasta las 9pm' } })
}

describe('Publicar (HU-005: solo ARRENDADOR, nace PENDIENTE)', () => {
  it('sin token muestra auth unificado y no llama a la API', () => {
    renderPage()
    expect(screen.getByText('Publicar vivienda')).toBeInTheDocument()
    // M5: Google + Mi Perfil en vez del form legacy (sin credenciales).
    expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mi Perfil/ })).toHaveAttribute('href', '/perfil')
    expect(screen.queryByPlaceholderText('Ej: Habitacion amoblada cerca al Tulcan')).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('Google guarda retorno a /publicar y delega en supabaseClient', async () => {
    signInWithGoogle.mockResolvedValue({ via: 'sdk' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Continuar con Google/i }))
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalled())
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBe('/publicar')
  })

  it('Google sin configurar muestra guía accionable', async () => {
    signInWithGoogle.mockRejectedValue(new Error('Google OAuth no configurado todavía.'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Continuar con Google/i }))
    expect(await screen.findByText(/no configurado todavía/i)).toBeInTheDocument()
  })

  it('submit vacío bloquea con errores de validación y sin POST', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(screen.getAllByText('Mínimo 10 caracteres').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Canon > 0')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submit válido envía el payload mapeado y muestra PENDIENTE', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.post.mockResolvedValue(CREATED)
    renderPage()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, payload, config] = api.post.mock.calls[0]
    expect(url).toBe('/api/publicaciones')
    expect(payload).toMatchObject({
      titulo: 'Habitación de prueba con título largo',
      tipo_inmueble: 'HABITACION_INDEPENDIENTE',
      canon_mensual: 450000,
      deposito_requerido: 0,
      zona_barrio_id: 3,
      servicios_ids: [1],
      campus_ids: [],
      latitud: null,
      longitud: null,
    })
    expect(payload.fotos).toHaveLength(3)
    expect(config.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(await screen.findByText(/¡Publicación creada! Estado: PENDIENTE/)).toBeInTheDocument()
  })

  it('sin servicios seleccionados exige al menos 1', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'WiFi Fibra' }))
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(screen.getByText('Selecciona al menos 1 servicio')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('URL de foto inválida se rechaza antes del POST', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fillValid()
    fireEvent.change(screen.getByPlaceholderText('https://.../foto1.jpg'), { target: { value: 'notaurl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(screen.getByText('URLs deben ser http(s) válidas')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('canon bajo muestra la advertencia de monto total', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.change(canonSel(), { target: { value: '50000' } })
    expect(screen.getByRole('status')).toHaveTextContent(/¿El precio es correcto?/)
  })

  it('punto del mapa confirma ubicación y Quitar la libera', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.click(screen.getByTestId('mock-mapa'))
    expect(screen.getByText(/Ubicación confirmada/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    expect(screen.getByText(/Sin ubicación marcada/)).toBeInTheDocument()
  })

  it('fotos del uploader entran al formulario', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.click(screen.getByTestId('mock-fotos'))
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(api.post).toHaveBeenCalled()
  })

  it('401/403/array del backend se traducen a mensajes legibles', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fillValid()
    api.post.mockRejectedValueOnce({ response: { status: 401, data: {} } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(await screen.findByText('No autorizado. Verifica tu token ARRENDADOR.')).toBeInTheDocument()

    api.post.mockRejectedValueOnce({ response: { status: 403, data: {} } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    // v13: el 403 guía hacia verificación de correo / promoción automática.
    expect(await screen.findByText(/Solo ARRENDADOR puede publicar/)).toBeInTheDocument()

    api.post.mockRejectedValueOnce({ response: { data: { detail: [{ loc: ['body', 'titulo'], msg: 'corto' }] } } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(await screen.findByText('body.titulo: corto')).toBeInTheDocument()
  })

  it('cerrar sesión usa el logout total y vuelve al auth unificado', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.get.mockResolvedValue({ data: { email: 'a@b.co', rol: 'ARRENDADOR' } })
    render(<MemoryRouter><AuthProvider><Publicar /></AuthProvider></MemoryRouter>)
    // M1: el logout total es async (revoca en BD y luego limpia).
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/auth/logout', {},
      expect.objectContaining({ headers: expect.anything() })))
    await waitFor(() => expect(localStorage.getItem('alojau_token')).toBeNull())
    expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument()
  })
})
