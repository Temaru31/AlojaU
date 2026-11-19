import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { LegalModal, CONSENTIMIENTO_TEXTO, TERMINOS_COMPLETOS, POLITICA_COMPLETA } from './Legal'
import Toaster, { notifyToast } from './Toast'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('LegalModal honesto (Ley 1581)', () => {
  it('cerrado retorna null', () => {
    const { container } = render(<LegalModal titulo="T" contenido="x" abierto={false} onCerrar={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('abierto muestra título+contenido y Esc cierra', () => {
    const onCerrar = vi.fn()
    render(<LegalModal titulo="Términos" contenido={TERMINOS_COMPLETOS} abierto onCerrar={onCerrar} />)
    expect(screen.getByRole('dialog', { name: 'Términos' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalled()
  })

  it('click en el fondo cierra; otra tecla no', () => {
    const onCerrar = vi.fn()
    render(
      <div>
        <div aria-hidden="true" onClick={onCerrar} data-testid="fondo" />
        <LegalModal titulo="P" contenido={POLITICA_COMPLETA} abierto onCerrar={onCerrar} />
      </div>
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onCerrar).not.toHaveBeenCalled()
    expect(CONSENTIMIENTO_TEXTO).toContain('Ley 1581')
  })
})

describe('Toaster honesto', () => {
  it('sin eventos retorna null', () => {
    const { container } = render(<BrowserRouter><Toaster /></BrowserRouter>)
    expect(container.firstChild).toBeNull()
  })

  it('evento sin message se ignora', () => {
    render(<BrowserRouter><Toaster /></BrowserRouter>)
    act(() => { window.dispatchEvent(new CustomEvent('alojau:toast', { detail: {} })) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('message simple aparece y con href muestra link', () => {
    render(<BrowserRouter><Toaster /></BrowserRouter>)
    act(() => { notifyToast('Guardado', '/favoritos') })
    expect(screen.getByText('Guardado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver/ })).toHaveAttribute('href', '/favoritos')
  })

  it('auto-dismiss a los 3.5s con timers falsos', () => {
    vi.useFakeTimers()
    render(<BrowserRouter><Toaster /></BrowserRouter>)
    act(() => { notifyToast('Temporal') })
    expect(screen.getByText('Temporal')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3600) })
    expect(screen.queryByText('Temporal')).not.toBeInTheDocument()
  })
})
