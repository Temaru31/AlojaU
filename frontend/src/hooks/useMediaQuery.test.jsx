import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import useMediaQuery from './useMediaQuery'

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.matchMedia })

function Probe({ query }) {
  const ok = useMediaQuery(query)
  return <span data-testid="mq">{ok ? 'si' : 'no'}</span>
}

describe('useMediaQuery (gate Casa3D)', () => {
  it('sin matchMedia (SSR/jsdom) retorna false sin lanzar', () => {
    const original = window.matchMedia
    // @ts-ignore: simula entorno sin matchMedia
    delete window.matchMedia
    render(<Probe query="(min-width: 1024px)" />)
    expect(screen.getByTestId('mq')).toHaveTextContent('no')
    window.matchMedia = original
  })

  it('respeta el valor inicial y los cambios', () => {
    const oyentes = new Map()
    const mql = { matches: false, addEventListener: vi.fn((ev, fn) => oyentes.set(ev, fn)), removeEventListener: vi.fn() }
    window.matchMedia = vi.fn().mockReturnValue(mql)
    render(<Probe query="(min-width: 1024px)" />)
    expect(screen.getByTestId('mq')).toHaveTextContent('no')
    act(() => { oyentes.get('change')({ matches: true }) })
    expect(screen.getByTestId('mq')).toHaveTextContent('si')
  })

  it('fallback a addListener en Safari viejo y limpia al desmontar', () => {
    const mql = { matches: true, addListener: vi.fn(), removeListener: vi.fn() }
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { unmount } = render(<Probe query="(min-width: 1024px)" />)
    expect(screen.getByTestId('mq')).toHaveTextContent('si')
    expect(mql.addListener).toHaveBeenCalled()
    unmount()
    expect(mql.removeListener).toHaveBeenCalled()
  })
})
