import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Publicar from './Publicar'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

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
const LOGIN_OK = { data: { access_token: TOKEN } }
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
  it('sin token muestra el login y no llama a la API', () => {
    renderPage()
    expect(screen.getByText('Publicar vivienda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión como ARRENDADOR' })).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('login exitoso guarda el token y muestra el formulario', async () => {
    api.post.mockResolvedValue(LOGIN_OK)
    const { container } = renderPage()
    fireEvent.change(container.querySelector('input[type="email"]'), { target: { value: 'arriendo@popayan.co' } })
    fireEvent.change(container.querySelector('input[type="password"]'), { target: { value: 'AlojaU123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como ARRENDADOR' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
      email: 'arriendo@popayan.co', password: 'AlojaU123',
    }))
    expect(localStorage.getItem('alojau_token')).toBe(TOKEN)
    expect(await screen.findByRole('button', { name: 'Enviar a revision' })).toBeInTheDocument()
  })

  it('login fallido muestra el detail del backend', async () => {
    api.post.mockRejectedValue({ response: { data: { detail: 'Credenciales inválidas' } } })
    const { container } = renderPage()
    fireEvent.change(container.querySelector('input[type="email"]'), { target: { value: 'x@y.co' } })
    fireEvent.change(container.querySelector('input[type="password"]'), { target: { value: 'mala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como ARRENDADOR' }))
    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument()
    expect(localStorage.getItem('alojau_token')).toBeNull()
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
    expect(await screen.findByText('Solo ARRENDADOR puede publicar (403)')).toBeInTheDocument()

    api.post.mockRejectedValueOnce({ response: { data: { detail: [{ loc: ['body', 'titulo'], msg: 'corto' }] } } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }))
    expect(await screen.findByText('body.titulo: corto')).toBeInTheDocument()
  })

  it('cerrar sesión limpia el token y vuelve al login', () => {
    localStorage.setItem('alojau_token', TOKEN)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(localStorage.getItem('alojau_token')).toBeNull()
    expect(screen.getByRole('button', { name: 'Iniciar sesión como ARRENDADOR' })).toBeInTheDocument()
  })
})
