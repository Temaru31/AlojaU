// M3: contrato táctil 44px, tablas con scroll y cero desborde.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Card from './components/Card'
import Comparar from './pages/Comparar'
import { api } from './services/api'

vi.mock('./services/api', () => ({ api: { get: vi.fn() } }))
vi.mock('./contexts/CompararContext', () => ({
  useComparar: () => ({
    comparar: [1], clear: vi.fn(), toggle: vi.fn(), error: '',
    isSelected: () => false, max: 3,
  }),
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const pub = {
  id: 1, titulo: 'Táctil', canon_mensual: 400000, zona_nombre: 'Z',
  indice_confianza: 80,
  fotos: ['https://a.com/1.jpg', 'https://a.com/2.jpg'],
}

describe('M3 áreas táctiles (contrato anti-regresión)', () => {
  it('dots del carousel extienden el área sin deformar el punto', () => {
    render(<Card pub={pub} />)
    const dot = screen.getByRole('button', { name: 'Ver foto 2' })
    expect(dot.className).toContain('w-2')
    expect(dot.className).toContain('before:-inset-2.5')
  })

  it('Comparar conserva scroll horizontal + columna sticky (no cards)', async () => {
    const { api: apiMock } = await import('./services/api')
    apiMock.get.mockResolvedValue({ data: { id: 1, titulo: 'T', estado: 'ACTIVO', fotos: [] } })
    const { container } = render(
      <BrowserRouter>
        <Comparar />
      </BrowserRouter>,
    )
    await screen.findAllByText('T')
    const scroller = container.querySelector('.overflow-x-auto')
    expect(scroller).not.toBeNull()
    expect(scroller.querySelector('table')).not.toBeNull()
    expect(scroller.querySelector('.sticky')).not.toBeNull()
  })

  it('Card no desborda (overflow + min-w-0 + truncate)', () => {
    const { container } = render(<Card pub={{ ...pub, titulo: 'B'.repeat(200) }} />)
    expect(container.firstChild.className).toContain('overflow-hidden')
    expect(container.firstChild.className).toContain('min-w-0')
  })
})
