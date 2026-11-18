// ChatWidget.test.jsx — widget del chatbot (sin PG, con api mockeada).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatWidget from './ChatWidget'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: null, user: null }) }))
vi.mock('../constants', () => ({
  leerConfigCache: () => null,
  fetchConfigPublica: vi.fn(),
  LIMITES: {},
}))
vi.mock('./Toast', () => ({ notifyToast: vi.fn(), default: () => null }))

import { fetchConfigPublica } from '../constants'

const RTA_OK = {
  respuesta: 'Roomies sirve para encontrar compañero de apartamento.',
  acciones_sugeridas: [{ etiqueta: 'Ir a Roomies', ruta: '/roomies' }],
  deshabilitado: false, request_id: 'abc',
}

function montar(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ChatWidget />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchConfigPublica.mockResolvedValue({ chat_enabled: true })
  api.post.mockResolvedValue({ data: RTA_OK })
})

afterEach(() => { cleanup() })

describe('ChatWidget', () => {
  it('oculto si chat_enabled es false', async () => {
    fetchConfigPublica.mockResolvedValue({ chat_enabled: false })
    montar()
    await waitFor(() => expect(fetchConfigPublica).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /asistente/i })).not.toBeInTheDocument()
  })

  it('oculto en /admin/* aunque esté habilitado', async () => {
    montar('/admin/dashboard')
    await waitFor(() => expect(fetchConfigPublica).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /asistente/i })).not.toBeInTheDocument()
  })

  it('FAB abre el panel con mensaje de bienvenida (se identifica como automático)', async () => {
    montar()
    const fab = await screen.findByRole('button', { name: /abrir asistente/i })
    fireEvent.click(fab)
    expect(await screen.findByRole('dialog', { name: /asistente virtual/i })).toBeInTheDocument()
    expect(screen.getByText(/asistente automático/i)).toBeInTheDocument()
    expect(screen.getByText(/no me compartas documentos/i)).toBeInTheDocument()
  })

  it('envía mensaje y renderiza respuesta + acción', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /abrir asistente/i }))
    fireEvent.change(screen.getByLabelText(/escribe tu mensaje/i), { target: { value: '¿qué hace roomies?' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ mensaje: '¿qué hace roomies?' }),
      undefined,
    ))
    expect(await screen.findByText('Roomies sirve para encontrar compañero de apartamento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir a Roomies' })).toBeInTheDocument()
  })

  it('error 429 muestra mensaje claro sin toast', async () => {
    api.post.mockRejectedValue({ response: { status: 429 } })
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /abrir asistente/i }))
    fireEvent.change(screen.getByLabelText(/escribe tu mensaje/i), { target: { value: 'hola' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }))
    expect(await screen.findByText(/muchas consultas/i)).toBeInTheDocument()
  })

  it('error de red muestra reintentar y reintenta', async () => {
    api.post.mockRejectedValueOnce(new Error('caído'))
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /abrir asistente/i }))
    fireEvent.change(screen.getByLabelText(/escribe tu mensaje/i), { target: { value: 'hola' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }))
    expect(await screen.findByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    api.post.mockResolvedValueOnce({ data: RTA_OK })
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(await screen.findByText('Roomies sirve para encontrar compañero de apartamento.')).toBeInTheDocument()
  })

  it('respuesta con HTML se renderiza como texto (no se ejecuta)', async () => {
    api.post.mockResolvedValue({
      data: { ...RTA_OK, respuesta: 'Mira <script>alert(1)</script> esto', acciones_sugeridas: [] },
    })
    const { container } = montar()
    fireEvent.click(await screen.findByRole('button', { name: /abrir asistente/i }))
    fireEvent.change(screen.getByLabelText(/escribe tu mensaje/i), { target: { value: 'hola' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }))
    await waitFor(() => expect(screen.getByText(/Mira .* esto/)).toBeInTheDocument())
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('<script>')
  })

  it('Escape cierra el panel', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /abrir asistente/i }))
    expect(await screen.findByRole('dialog', { name: /asistente virtual/i })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /asistente virtual/i })).not.toBeInTheDocument())
  })
})
