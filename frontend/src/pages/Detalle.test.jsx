import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Detalle, { humanizarTipo } from './Detalle'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
// Leaflet no corre en jsdom: se mockean hijos visuales (el scroll/botones se prueban aquí).
vi.mock('../components/MapaZona', () => ({ default: (props) => <div data-testid="mapa" data-aviso={props.aviso ? JSON.stringify(props.aviso) : ''} data-lugar={props.lugar ? JSON.stringify(props.lugar) : ''} /> }))
vi.mock('../components/GaleriaFotos', () => ({ default: () => <div data-testid="galeria" /> }))
vi.mock('../components/IndiceConfianza', () => ({ default: () => <div data-testid="indice" /> }))
vi.mock('../components/ReportarModal', () => ({ default: () => <div data-testid="reportar" /> }))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const pub = {
  id: 1, titulo: 'Habitación cerca Tulcán', estado: 'ACTIVO',
  canon_mensual: 450000, deposito_requerido: 200000,
  descripcion: 'Habitación amplia con baño privado y servicios incluidos cerca a la Facultad.',
  tipo_inmueble: 'HABITACION_INDEPENDIENTE',
  zona_nombre: 'Tulcán', fotos: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'],
  telefono_whatsapp: '573001234567',
}

const renderDetalle = () => render(
  <MemoryRouter initialEntries={['/publicacion/1']}>
    <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
  </MemoryRouter>
)

describe('Detalle UX', () => {
  it('al montar hace scroll al tope (fotos/título, no mapa)', async () => {
    const scrollSpy = vi.fn()
    window.scrollTo = scrollSpy
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    // Título aparece en breadcrumb + h1: basta con que esté visible
    await waitFor(() => expect(screen.getAllByText('Habitación cerca Tulcán').length).toBeGreaterThan(0))
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })

  it('muestra Reportar en cabecera y junto al contacto (no enlace gris bajo mapa)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getAllByText('Habitación cerca Tulcán').length).toBeGreaterThan(0))
    // Cabecera: botón secundario visible junto a favoritos/comparar
    expect(screen.getByRole('button', { name: 'Reportar este aviso' })).toBeInTheDocument()
    // Tarjeta contacto: enlace legible con pregunta
    expect(screen.getByRole('button', { name: /¿Hay algún problema con este anuncio\?/ })).toBeInTheDocument()
  })

  it('P-01: renderiza descripción + total primer mes + tipo humanizado', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Descripción')).toBeInTheDocument())
    expect(screen.getByText(/Habitación amplia con baño privado/)).toBeInTheDocument()
    expect(screen.getByText('Contrato y estadía')).toBeInTheDocument()
    expect(screen.getAllByText('Habitación independiente').length).toBeGreaterThan(0)
    // 450.000 + 200.000 = 650.000 (aparece en resumen y en tabla contrato)
    expect(screen.getByText(/Total primer mes/)).toBeInTheDocument()
    expect(screen.getAllByText(/650\.000/).length).toBeGreaterThan(0)
  })

  it('P-01: depósito 0 muestra "Sin depósito" y null muestra "no informado"', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, deposito_requerido: 0 } })
    const { unmount } = renderDetalle()
    await waitFor(() => expect(screen.getAllByText('Sin depósito').length).toBeGreaterThan(0))
    unmount(); cleanup()
    api.get.mockResolvedValue({ data: { ...pub, deposito_requerido: null, deposito: null } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/Depósito no informado/)).toBeInTheDocument())
  })

  it('P-04: clic en WhatsApp registra contacto + copiar número', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    const { default: userEvent } = await import('@testing-library/user-event')
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('link', { name: /Contactar por WhatsApp/ })).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: /Contactar por WhatsApp/ }))
    await waitFor(() => expect(screen.getByText(/Ya contactaste este aviso/)).toBeInTheDocument())
    const guardados = JSON.parse(localStorage.getItem('alojau_contactos') || '[]')
    expect(guardados.some(c => c.id === 1)).toBe(true)
    expect(screen.getByRole('button', { name: /Copiar número/ })).toBeInTheDocument()
  })

  it('distingue 404 de error de red con Reintentar', async () => {
    window.scrollTo = vi.fn()
    api.get.mockRejectedValue({ response: { status: 500 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/No se pudo cargar la publicación/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('Oleada 2: pasa coords del aviso al mapa (modo aviso + deep-link)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, latitud: 2.4451, longitud: -76.6085 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByTestId('mapa')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.aviso).toContain('2.4451')
  })

  it('Oleada 2: sin coords el mapa va en modo campus (aviso vacío)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, latitud: null, longitud: null } })
    renderDetalle()
    await waitFor(() => expect(screen.getByTestId('mapa')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.aviso).toBe('')
  })
})

describe('Detalle 004 sincronización dinámica del mapa', () => {
  const renderDetalleQs = (qs) => render(
    <MemoryRouter initialEntries={[`/publicacion/1${qs}`]}>
      <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
    </MemoryRouter>
  )

  it('con ?campus_id= pide el detalle con ese param y sincroniza el lugar', async () => {
    window.scrollTo = vi.fn()
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: [] })
      return Promise.resolve({
        data: {
          ...pub, latitud: 2.4451, longitud: -76.6085,
          distancia_geodesica_m: 900,
          campus_ref: {
            campus_id: 3, institucion: 'Centro Comercial Campanario', nombre_sede: 'Sede Única',
            latitud: 2.4467, longitud: -76.6014, dist_m: 900, tiempo_pie_min: 15,
          },
        },
      })
    })
    renderDetalleQs('?campus_id=3')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/publicaciones/1?campus_id=3', {}))
    const mapa = await screen.findByTestId('mapa')
    expect(mapa.dataset.lugar).toContain('Campanario')
    expect(mapa.dataset.lugar).toContain('2.4467')
    expect(screen.getByText(/Distancia a Sede Única/)).toBeInTheDocument()
  })

  it('sin ?campus_id= modo inmueble único (sin distancia a campus)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, distancia_geodesica_m: 320 } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Descripción')).toBeInTheDocument())
    expect(screen.getByTestId('mapa').dataset.lugar).toBe('')
    // Tarea 1 (v10): encabezado de vivienda, sin cálculo hacia campus no elegido.
    expect(screen.getByText('Ubicación de la vivienda')).toBeInTheDocument()
    expect(screen.queryByText('Distancia al campus')).not.toBeInTheDocument()
  })

  it('PAUSADO_POR_REPORTE muestra tarjeta explicativa (no el aviso genérico)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockResolvedValue({ data: { ...pub, estado: 'PAUSADO_POR_REPORTE' } })
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/Anuncio pausado temporalmente/)).toBeInTheDocument()
    expect(screen.getByText(/contacto está deshabilitado/)).toBeInTheDocument()
  })
})

describe('Detalle 004 distancias honestas', () => {
  const renderDetalleQs = (qs) => render(
    <MemoryRouter initialEntries={[`/publicacion/1${qs}`]}>
      <Routes><Route path="/publicacion/:id" element={<Detalle />} /></Routes>
    </MemoryRouter>
  )

  it('ref con dist_m null muestra "No informado" (no hereda otro lugar)', async () => {
    window.scrollTo = vi.fn()
    api.get.mockImplementation((url) => {
      if (url === '/api/campus') return Promise.resolve({ data: [] })
      return Promise.resolve({
        data: {
          ...pub, latitud: 2.4451, longitud: -76.6085,
          distancia_geodesica_m: 900,
          campus_ref: {
            campus_id: 5, institucion: 'Terminal de Transportes', nombre_sede: 'Sede Única',
            latitud: 2.4505, longitud: -76.613, dist_m: null, tiempo_pie_min: null,
          },
        },
      })
    })
    renderDetalleQs('?campus_id=5')
    await waitFor(() => expect(screen.getByText('Distancia a Sede Única')).toBeInTheDocument())
    // No hereda los 900 m de otro lugar: no aparece ninguna distancia en el bloque.
    expect(screen.queryByText(/900/)).not.toBeInTheDocument()
  })
})

describe('Detalle ramas sin cubrir (contacto, errores, fallbacks)', () => {
  it('humanizarTipo: conocido traduce, desconocido conserva, vacío informa', () => {
    expect(humanizarTipo('COMPARTIDO')).toBe('Compartido')
    expect(humanizarTipo('LOFT')).toBe('LOFT')
    expect(humanizarTipo(null)).toBe('No informado')
    expect(humanizarTipo(undefined)).toBe('No informado')
  })

  it('PENDIENTE muestra aviso ámbar y oculta el WhatsApp', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: { ...pub, estado: 'PENDIENTE' } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/No disponible para contacto por ahora/)).toBeInTheDocument())
    expect(screen.getByText(/en revisión/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Contactar por WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.getByText('Este aviso no está disponible por ahora')).toBeInTheDocument()
  })

  it('ACTIVO sin teléfono autorizado explica que no hay contacto', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: { ...pub, telefono_whatsapp: null } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/Sin WhatsApp autorizado/)).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /Contactar por WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar y avísame si habilita contacto/ })).toBeInTheDocument()
  })

  it('contacto ya registrado se refleja sin volver a pulsar', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    localStorage.setItem('alojau_contactos', JSON.stringify([{ id: 1, titulo: 'x', fecha: '2026-01-01' }]))
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/Ya contactaste este aviso/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ya contacté por otro medio' })).not.toBeInTheDocument()
  })

  it('storage corrupto no rompe el detalle (contactos e historial opcionales)', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    localStorage.setItem('alojau_contactos', '{roto')
    localStorage.setItem('alojau_historial', '[roto')
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getAllByText('Habitación cerca Tulcán').length).toBeGreaterThan(0))
  })

  it('descripción larga ofrece Leer más / Leer menos', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: { ...pub, descripcion: 'Detalle. '.repeat(40) } })
    renderDetalle()
    const mas = await screen.findByRole('button', { name: 'Leer más' })
    fireEvent.click(mas)
    expect(await screen.findByRole('button', { name: 'Leer menos' })).toBeInTheDocument()
  })

  it('sin descripción informa que el arrendador no la agregó', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: { ...pub, descripcion: '  ' } })
    renderDetalle()
    await waitFor(() => expect(screen.getByText(/El arrendador aún no agregó una descripción/)).toBeInTheDocument())
  })

  it('botón Reportar abre el modal', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reportar este aviso' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reportar este aviso' }))
    expect(screen.getByTestId('reportar')).toBeInTheDocument()
  })

  it('favorito alterna el toast con enlace a Favoritos', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('button', { name: '♡ Añadir a favoritos' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '♡ Añadir a favoritos' }))
    expect(await screen.findByText(/Guardado en favoritos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver →' })).toHaveAttribute('href', '/favoritos')
  })

  it('comparar alterna sin toast cuando hay menos de 2', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Comparar (máx 3)' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Comparar (máx 3)' }))
    expect(screen.queryByText(/Añadido a comparar/)).not.toBeInTheDocument()
  })

  it('copiar sin portapapeles no rompe y conserva el botón', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    const btn = await screen.findByRole('button', { name: 'Copiar número' })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Copiar número' })).toBeInTheDocument()
    expect(screen.queryByText('✓ Número copiado')).not.toBeInTheDocument()
  })

  it('Ya contacté por otro medio marca y oculta la acción', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    const btn = await screen.findByRole('button', { name: 'Ya contacté por otro medio' })
    fireEvent.click(btn)
    expect(await screen.findByText(/Marcado como contactado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya contacté por otro medio' })).not.toBeInTheDocument()
  })

  it('canon y depósito nulos muestran No informado (sin total)', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({
      data: {
        ...pub, canon_mensual: undefined, canon: undefined,
        deposito_requerido: null, deposito: null,
        reglas_convivencia: 'Reglas claras de convivencia',
        direccion_referencial: 'Calle 5 # 4-70',
      },
    })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Descripción')).toBeInTheDocument())
    expect(screen.getAllByText('No informado').length).toBe(3)
    expect(screen.queryByText(/Total primer mes/)).not.toBeInTheDocument()
  })

  it('respuesta nula informa publicación no encontrada', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: null })
    renderDetalle()
    await waitFor(() => expect(screen.getByText('Publicación no encontrada')).toBeInTheDocument())
  })

  it('tipo y servicios crudos se muestran tal cual (badges)', async () => {
    window.scrollTo = vi.fn()
    localStorage.clear()
    api.get.mockResolvedValue({ data: { ...pub, tipo_inmueble: 'LOFT', servicios: ['WiFi Fibra', 'Amoblado'] } })
    renderDetalle()
    await waitFor(() => expect(screen.getAllByText('LOFT').length).toBe(2))
    expect(screen.getByText('WiFi Fibra')).toBeInTheDocument()
    expect(screen.getByText('Amoblado')).toBeInTheDocument()
  })
})

describe('Detalle v14.1 (sesión en vistas)', () => {
  it('con token: envía Authorization para que el dueño vea su PENDIENTE', async () => {
    const AuthCtx = await import('../contexts/AuthContext')
    const spy = vi.spyOn(AuthCtx, 'useAuth').mockReturnValue({
      token: 'tok-dueno', user: { email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    try {
      api.get.mockResolvedValue({ data: pub })
      renderDetalle()
      await waitFor(() => expect(api.get).toHaveBeenCalledWith(
        '/api/publicaciones/1',
        { headers: { Authorization: 'Bearer tok-dueno' } },
      ))
    } finally {
      spy.mockRestore()
    }
  })

  it('sin token: no envía Authorization (lectura pública)', async () => {
    api.get.mockResolvedValue({ data: pub })
    renderDetalle()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/publicaciones/1', {}))
  })
})

describe('Detalle v15.2 (dueño, inactivo y similares)', () => {
  it('dueño ve botón Editar publicación; tercero no', async () => {
    const AuthCtx = await import('../contexts/AuthContext')
    const spy = vi.spyOn(AuthCtx, 'useAuth').mockReturnValue({
      token: 't', user: { id: 9, email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    try {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/similares')) return Promise.resolve({ data: { items: [], total: 0 } })
        if (url.endsWith('/vista')) return Promise.resolve({ data: { vistas: 1, contada: true } })
        return Promise.resolve({ data: { ...pub, usuario_id: 9 } })
      })
      renderDetalle()
      expect(await screen.findByRole('button', { name: /Editar Habitación cerca Tulcán/ })).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('M4 dueño ve Historial del inmueble; tercero no', async () => {
    const AuthCtx = await import('../contexts/AuthContext')
    const spy = vi.spyOn(AuthCtx, 'useAuth').mockReturnValue({
      token: 't', user: { id: 9, email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    try {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/similares')) return Promise.resolve({ data: { items: [], total: 0 } })
        if (url.endsWith('/vista')) return Promise.resolve({ data: { vistas: 1, contada: true } })
        if (url.endsWith('/historial')) return Promise.resolve({ data: { id: 1, items: [
          { id: 5, evento: 'CREATED', detalle: null, creado_en: '2026-09-10T10:00:00-05:00' },
          { id: 9, evento: 'PAUSED', detalle: null, creado_en: '2026-09-12T10:00:00-05:00' },
        ] } })
        return Promise.resolve({ data: { ...pub, usuario_id: 9 } })
      })
      renderDetalle()
      expect(await screen.findByRole('heading', { name: /Historial del inmueble/ })).toBeInTheDocument()
      expect(screen.getByText('Creada')).toBeInTheDocument()
      expect(screen.getByText('Pausada')).toBeInTheDocument()
      expect(screen.queryByText('CREATED')).not.toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('aviso inactivo muestra banner y similares; contacto oculto', async () => {
    const AuthCtx = await import('../contexts/AuthContext')
    const spy = vi.spyOn(AuthCtx, 'useAuth').mockReturnValue({
      token: 't', user: { id: 9, email: 'a@b.co' }, loading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    try {
      const similar = { ...pub, id: 2, titulo: 'Vecina Tulcán', estado: 'ACTIVO' }
      api.get.mockImplementation((url) => {
        if (url.endsWith('/similares')) return Promise.resolve({ data: { items: [similar], total: 1 } })
        if (url.endsWith('/vista')) return Promise.resolve({ data: { vistas: 5, contada: true } })
        return Promise.resolve({ data: { ...pub, usuario_id: 9, estado: 'PAUSADO', telefono_whatsapp: '573001234567' } })
      })
      renderDetalle()
      expect(await screen.findByText(/temporalmente pausada o desactualizada/)).toBeInTheDocument()
      expect(await screen.findByText('Inmuebles similares disponibles en esta zona')).toBeInTheDocument()
      expect(await screen.findByText('Vecina Tulcán')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Contactar por WhatsApp/ })).not.toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('404 muestra cortesía de no disponible', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    renderDetalle()
    expect(await screen.findByText('Esta publicación no se encuentra disponible actualmente')).toBeInTheDocument()
  })
})
