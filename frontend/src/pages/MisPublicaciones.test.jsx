import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MisPublicaciones, { calcularVigencia } from './MisPublicaciones'
import EditarPublicacionModal from '../components/EditarPublicacionModal'
import { api } from '../services/api'
import * as Auth from '../contexts/AuthContext'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const renderPage = (token) => {
  vi.spyOn(Auth, 'useAuth').mockReturnValue({
    token, user: token ? { email: 'arrendador@alojau.com' } : null,
    loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
  })
  return render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
}

// Backend paginado real: {items,total,page,size,pages}
const paged = (items, total = items.length) => ({ items, total, page: 1, size: 12, pages: Math.max(1, Math.ceil(total / 12)) })
const pub1 = {
  id: 3,
  titulo: 'Habitación Tulcán',
  tipo_inmueble: 'HABITACION_INDEPENDIENTE',
  zona_nombre: 'Tulcán',
  canon_mensual: 380000,
  estado: 'PENDIENTE',
  indice_confianza: 70,
  distancia_geodesica_m: 111,
  fotos: ['https://res.cloudinary.com/demo/image/upload/v1/alojau/foto1.jpg'],
}

describe('Reglas de cálculo de vigencia (calcularVigencia)', () => {
  it('cuando faltan exactamente 10 días, presenta "10 días restantes"', () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    const exp10Dias = '2026-10-11T10:00:00Z'
    const res = calcularVigencia(exp10Dias, ahora)
    expect(res.texto).toBe('10 días restantes')
    expect(res.vigente).toBe(true)
  })

  it('cuando falta 1 día, presenta "1 día restante"', () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    const exp1Dia = '2026-10-02T10:00:00Z'
    const res = calcularVigencia(exp1Dia, ahora)
    expect(res.texto).toBe('1 día restante')
    expect(res.vigente).toBe(true)
  })

  it('cuando la publicación vence el mismo día, presenta "Vence hoy"', () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    const expHoy = '2026-10-01T18:00:00Z'
    const res = calcularVigencia(expHoy, ahora)
    expect(res.texto).toBe('Vence hoy')
    expect(res.venceHoy).toBe(true)
  })

  it('cuando la fecha de expiración ya pasó, presenta "Vencida"', () => {
    const ahora = new Date('2026-10-05T10:00:00Z')
    const expPasada = '2026-10-01T10:00:00Z'
    const res = calcularVigencia(expPasada, ahora)
    expect(res.texto).toBe('Vencida')
    expect(res.vencida).toBe(true)
  })
})

describe('MisPublicaciones', () => {
  it('sin token: informa que debe iniciar sesión y muestra enlace', () => {
    renderPage('')
    expect(screen.getByText(/Inicia sesión para ver tus publicaciones/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi Perfil / Iniciar Sesión' })).toHaveAttribute('href', '/perfil')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lista avisos paginados con estado legible (nunca enum crudo) y todos los datos visibles', async () => {
    const ahora = new Date()
    const exp10Dias = new Date(ahora.getTime() + 10 * 86_400_000).toISOString()

    api.get.mockResolvedValue({
      data: paged([
        { ...pub1, fecha_expiracion: exp10Dias },
        {
          id: 1,
          titulo: 'Apartaestudio frente Tulcán',
          tipo_inmueble: 'APARTAESTUDIO',
          zona_nombre: 'Centro Histórico',
          canon_mensual: 450000,
          estado: 'ACTIVO',
          indice_confianza: 95,
          distancia_geodesica_m: 320,
          fecha_expiracion: new Date(ahora.getTime() - 2 * 86_400_000).toISOString(),
          fotos: ['https://res.cloudinary.com/demo/image/upload/v1/alojau/foto2.jpg'],
        },
      ], 2),
    })

    renderPage('tok')
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()

    // Badge dentro de la tarjeta
    const card1 = screen.getByText('Habitación Tulcán').closest('article')
    expect(within(card1).getByText('En revisión')).toBeInTheDocument()
    expect(within(card1).getByText('Habitación independiente')).toBeInTheDocument()
    expect(within(card1).getByText('Tulcán')).toBeInTheDocument()
    expect(within(card1).getByText('$380.000 COP/mes')).toBeInTheDocument()
    expect(within(card1).getByText('10 días restantes')).toBeInTheDocument()
    expect(within(card1).getByRole('button', { name: /Renovar/ })).toBeInTheDocument()
    expect(within(card1).getByRole('link', { name: /Ver detalle/ })).toHaveAttribute('href', '/publicacion/3')

    // Tarjeta vencida
    const card2 = screen.getByText('Apartaestudio frente Tulcán').closest('article')
    expect(within(card2).getByText('Publicada')).toBeInTheDocument()
    expect(within(card2).getByText('Vencida')).toBeInTheDocument()

    // UX: nunca el enum crudo de BD
    expect(screen.queryByText('ACTIVO')).not.toBeInTheDocument()
    expect(screen.queryByText('PENDIENTE')).not.toBeInTheDocument()
  })

  it('filtro En revisión pide estado=PENDIENTE al backend', async () => {
    api.get.mockResolvedValue({ data: paged([pub1], 1) })
    renderPage('tok')
    await screen.findByText('Habitación Tulcán')
    fireEvent.click(screen.getByRole('button', { name: 'En revisión' }))
    await screen.findByText('Habitación Tulcán')
    const lastCall = api.get.mock.calls.at(-1)
    expect(lastCall[0]).toBe('/api/publicaciones/mias')
    expect(lastCall[1].params.estado).toBe('PENDIENTE')
    expect(lastCall[1].headers.Authorization).toMatch(/^Bearer /)
  })

  it('vacío: muestra estado explicativo y acción para publicar', async () => {
    api.get.mockResolvedValue({ data: paged([]) })
    renderPage('tok')
    expect(await screen.findByText(/Aún no publicas nada/)).toBeInTheDocument()
    expect(screen.getByText(/No tienes publicaciones registradas en tu cuenta/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Publicar mi primera vivienda/ })).toHaveAttribute('href', '/publicar')
  })

  it('401: sesión vencida guía a "Volver a ingresar" en vez de Reintentar', async () => {
    api.get.mockRejectedValue({ response: { status: 401 } })
    renderPage('tok')
    expect(await screen.findByText(/Sesión vencida/)).toBeInTheDocument()
    // FASE 2: reintentar sin token no sirve; el CTA lleva a /perfil.
    expect(screen.getByRole('link', { name: /Volver a ingresar/i })).toHaveAttribute('href', '/perfil')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('al pulsar Renovar y confirmar, actualiza la tarjeta reactivamente sin recargar', async () => {
    const ahora = new Date()
    const expVieja = new Date(ahora.getTime() + 2 * 86_400_000).toISOString()
    const expNueva = new Date(ahora.getTime() + 32 * 86_400_000).toISOString()

    api.get.mockResolvedValue({
      data: paged([{ ...pub1, id: 3, fecha_expiracion: expVieja, estado: 'ACTIVO' }], 1),
    })

    api.patch.mockResolvedValue({
      data: {
        id: 3,
        estado: 'ACTIVO',
        fecha_expiracion_anterior: expVieja,
        fecha_expiracion_nueva: expNueva,
        dias_agregados: 30,
        mensaje: 'Publicación renovada con éxito por 30 días adicionales',
      },
    })

    renderPage('tok')
    await screen.findByText('Habitación Tulcán')

    // Botón renovar de la tarjeta
    fireEvent.click(screen.getByRole('button', { name: /Renovar Habitación Tulcán/ }))

    // Se abre el modal
    expect(await screen.findByText('Renovar publicación')).toBeInTheDocument()

    // Confirmar renovación
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar renovación' }))

    // Esperar llamada a endpoint PATCH
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/api/publicaciones/3/renovar',
        {},
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
      )
    })

    // Cerrar modal
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    // La tarjeta ahora refleja los nuevos días calculados reactivamente
    await waitFor(() => {
      expect(screen.getByText(/32 días restantes/)).toBeInTheDocument()
    })
  })
})

describe('EditarPublicacionModal', () => {
  // M4: el modal bufferiza fotos+tags; el pub trae lo mínimo real (cards).
  const renderModal = (onSaved = vi.fn(), extra = {}) => render(
    <MemoryRouter>
      <EditarPublicacionModal
        pub={{ id: 1, titulo: 'Habitación cerca Tulcán - 320m', descripcion: 'Descripción con más de veinte caracteres ok', tipo_inmueble: 'APARTAESTUDIO', canon_mensual: 500000, deposito_requerido: 0, direccion_referencial: 'Calle 5 # 2-10 Tulcán', reglas_convivencia: 'Reglas de convivencia claras', servicios_ids: [1], fotos: ['https://a/1.jpg'], imagenes: [{ id: 7, url: 'https://a/1.jpg', orden: 1 }], ...extra }}
        token="tok"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </MemoryRouter>
  )

  it('valida mínimo local antes de llamar al backend', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'corto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Título: mínimo 10/)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('guarda PATCH escalares+tags y avisa al padre', async () => {
    const onSaved = vi.fn()
    api.patch.mockResolvedValue({ data: { id: 1, titulo: 'Habitación cerca Tulcán - 320m' } })
    api.get.mockResolvedValue({ data: { fotos: ['https://a/1.jpg'], imagenes: [{ id: 7, url: 'https://a/1.jpg', orden: 1 }] } })
    renderModal(onSaved)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/publicaciones/1', expect.objectContaining({ titulo: 'Habitación cerca Tulcán - 320m' }), expect.anything()))
    // Sin cambios en fotos: NO llama al endpoint de fotos.
    expect(api.patch).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalled()
  })

  it('exige al menos 1 servicio antes de guardar', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'WiFi Fibra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/al menos 1 servicio/i)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('403 muestra permiso denegado', async () => {
    api.patch.mockRejectedValue({ response: { status: 403 } })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Solo el dueño/)).toBeInTheDocument()
  })
})

describe('MisPublicaciones v13.2 (borrado dueño + reactividad de rol)', () => {
  it('eliminar pide confirmación en dos pasos y luego llama DELETE', async () => {
    api.get.mockResolvedValue({ data: paged([{ ...pub1 }]) })
    const refresh = vi.fn()
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh,
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    api.delete.mockResolvedValue({ data: { id: 3, eliminada: true, rol: 'ARRENDADOR', rol_actualizado: false } })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Habitación Tulcán' }))
    // Primer clic: pide confirmar, aún no borra.
    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Confirmar eliminación/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar eliminación/ }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/publicaciones/3', expect.anything()))
    // Sin democión: no refresca el perfil.
    expect(refresh).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Habitación Tulcán')).not.toBeInTheDocument())
  })

  it('si el backend reporta democión, refresca el perfil', async () => {
    api.get.mockResolvedValue({ data: paged([{ ...pub1 }]) })
    const refresh = vi.fn()
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh,
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    api.delete.mockResolvedValue({ data: { id: 3, eliminada: true, rol: 'ESTUDIANTE', rol_actualizado: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Habitación Tulcán' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar eliminación/ }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('MisPublicaciones v15.2 (switch estado + vistas)', () => {
  it('switch pausar/reanudar actualiza el item', async () => {
    api.get.mockResolvedValue({ data: paged([{ ...pub1, estado: 'ACTIVO' }]) })
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    api.patch.mockResolvedValue({ data: { id: 3, estado: 'PAUSADO', rol_actualizado: false } })
    fireEvent.click(screen.getByRole('button', { name: 'Pausar Habitación Tulcán' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/publicaciones/3/estado', { estado: 'PAUSADO' }, expect.anything()))
    expect(await screen.findByRole('button', { name: 'Reanudar Habitación Tulcán' })).toBeInTheDocument()
  })

  it('muestra contador de vistas cuando el backend lo trae', async () => {
    api.get.mockResolvedValue({ data: paged([{ ...pub1, vistas: 42 }]) })
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    expect(screen.getByLabelText('42 vistas')).toBeInTheDocument()
  })
})

describe('MisPublicaciones M6 (orden server-side + etiquetas de pausa)', () => {
  it('dropdown envía ?orden= al backend y resetea a página 1', async () => {
    api.get.mockResolvedValue({ data: paged([{ ...pub1 }]) })
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    await screen.findByText('Habitación Tulcán')
    expect(api.get).toHaveBeenLastCalledWith('/api/publicaciones/mias',
      expect.objectContaining({ params: expect.objectContaining({ orden: 'recientes' }) }))
    fireEvent.change(screen.getByLabelText(/Ordenar mis publicaciones/i), { target: { value: 'vistas' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/api/publicaciones/mias',
      expect.objectContaining({ params: expect.objectContaining({ orden: 'vistas', page: 1 }) })))
  })

  it('distingue pausa del arrendador vs moderación', async () => {
    api.get.mockResolvedValue({
      data: paged([
        { ...pub1, id: 10, estado: 'PAUSADO' },
        { ...pub1, id: 11, estado: 'PAUSADO_POR_REPORTE' },
      ]),
    })
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
    expect((await screen.findAllByText('Habitación Tulcán')).length).toBe(2)
    expect(screen.getByText(/Pausada por el Arrendador/)).toBeInTheDocument()
    expect(screen.getByText(/Pausada por Moderación/)).toBeInTheDocument()
  })
})

describe('MisPublicaciones M4 (edición bufferizada en modal)', () => {
  const conFotos = {
    ...pub1,
    estado: 'ACTIVO',
    descripcion: 'Descripción con más de veinte caracteres ok',
    deposito_requerido: 0,
    direccion_referencial: 'Calle 5 # 2-10 Tulcán',
    reglas_convivencia: 'Reglas de convivencia claras',
    servicios_ids: [1],
    fotos: ['https://a/1.jpg', 'https://a/2.jpg'],
    imagenes: [
      { id: 11, url: 'https://a/1.jpg', orden: 1 },
      { id: 12, url: 'https://a/2.jpg', orden: 2 },
    ],
  }

  const renderConFotos = (detalle) => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/mias') || String(url).endsWith('/mias')) {
        return Promise.resolve({ data: paged([conFotos]) })
      }
      return Promise.resolve({ data: detalle })
    })
    vi.spyOn(Auth, 'useAuth').mockReturnValue({
      token: 't', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<MemoryRouter><MisPublicaciones /></MemoryRouter>)
  }

  it('borrar en dos pasos NO toca la BD hasta Guardar', async () => {
    renderConFotos(conFotos)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Habitación Tulcán' }))
    expect(await screen.findByText('Fotos del aviso (2/10)')).toBeInTheDocument()
    expect(screen.getByText('Portada', { selector: 'span' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar la foto 2' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación de la foto 2' }))
    // Buffer local: sin DELETE ni PATCH todavía, con aviso de cambios.
    expect(api.delete).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(await screen.findByText(/sin guardar/i)).toBeInTheDocument()
    // Guardar commitea TODO en UN solo PATCH (escalares + fotos).
    api.patch.mockResolvedValue({ data: { id: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith(
      '/api/publicaciones/3',
      expect.objectContaining({ fotos: ['https://a/1.jpg'] }),
      expect.anything())
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('portada reordena local y commitea en Guardar', async () => {
    renderConFotos(conFotos)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Habitación Tulcán' }))
    expect(await screen.findByText('Fotos del aviso (2/10)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usar como portada la foto 2' }))
    // Sin llamadas inmediatas (ni /orden ni DELETE).
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
    api.patch.mockResolvedValue({ data: { id: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith(
      '/api/publicaciones/3',
      expect.objectContaining({ fotos: ['https://a/2.jpg', 'https://a/1.jpg'] }),
      expect.anything())
  })

  it('etiquetas pre-pobladas y se envían en Guardar', async () => {
    renderConFotos(conFotos)
    expect(await screen.findByText('Habitación Tulcán')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Habitación Tulcán' }))
    expect(await screen.findByText('Fotos del aviso (2/10)')).toBeInTheDocument()
    // WiFi (id 1) viene activo desde servicios_ids.
    expect(screen.getByRole('button', { name: 'WiFi Fibra' })).toHaveAttribute('aria-pressed', 'true')
    api.patch.mockResolvedValue({ data: { id: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    // Sin cambios en tags: no envía servicios_ids.
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/publicaciones/3', expect.not.objectContaining({ servicios_ids: expect.anything() }), expect.anything()))
    expect(api.patch).toHaveBeenCalledTimes(1)
  })
})
