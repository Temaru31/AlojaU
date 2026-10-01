import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Publicar from './Publicar'
import { api } from '../services/api'
import { AuthProvider } from '../contexts/AuthContext'
import { signInWithGoogle, POST_LOGIN_REDIRECT_KEY } from '../services/supabaseClient'

vi.mock('../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  // Passthrough honesto: conserva headers e inyecta clave determinista.
  conIdempotencia: (c = {}) => ({ ...c, headers: { ...((c && c.headers) || {}), 'Idempotency-Key': 'test-key-bloque2' } }),
}))
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
    fireEvent.click(screen.getByTestId('mock-fotos'))
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
    expect(await screen.findByText(/¡Publicación enviada! Está en revisión/)).toBeInTheDocument()
  })

  it('R8 promoción a Arrendador: banner sin recargar la página', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.post.mockResolvedValue({
      data: { ...CREATED.data, rol: 'ARRENDADOR', rol_actualizado: true },
    })
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload: reloadSpy }, writable: true })
    renderPage()
    fireEvent.click(screen.getByTestId('mock-fotos'))
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(await screen.findByText(/Tu cuenta ahora es/)).toBeInTheDocument()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('Bloque 2: el POST lleva Idempotency-Key única por envío', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.post.mockResolvedValue(CREATED)
    renderPage()
    fireEvent.click(screen.getByTestId('mock-fotos'))
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const headers = api.post.mock.calls[0][2].headers
    expect(headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9-]{8,}$/)
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
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

  it('sin fotos subidas guía a pulsar Subir antes de Enviar', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(screen.getByText(/Mínimo 3 fotos/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('helpers: formato COP en vivo y sanitización anti-XSS', async () => {
    const { formatearCOP, sanitizarTexto } = await import('./Publicar')
    expect(formatearCOP('450000')).toBe('$ 450.000')
    expect(formatearCOP('')).toBe('')
    expect(sanitizarTexto('<script>alert(1)</script> hola')).not.toContain('<')
  })

  it('doble clic en Enviar no duplica el POST (anti-doble envío)', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.post.mockImplementation(() => new Promise((res) => setTimeout(() => res(CREATED), 60)))
    renderPage()
    fireEvent.click(screen.getByTestId('mock-fotos'))
    fillValid()
    const btn = screen.getByRole('button', { name: 'Enviar a revision' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(await screen.findByText(/¡Publicación enviada! Está en revisión/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledTimes(1)
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
    fireEvent.click(screen.getByTestId('mock-fotos'))
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

  it('con sesión no hay botón Cerrar sesión (vive en el navbar)', async () => {
    localStorage.setItem('alojau_token', TOKEN)
    api.get.mockResolvedValue({ data: { email: 'a@b.co', rol: 'ARRENDADOR' } })
    render(<MemoryRouter><AuthProvider><Publicar /></AuthProvider></MemoryRouter>)
    expect(await screen.findByPlaceholderText('Ej: Habitacion amoblada cerca al Tulcan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })
})
