import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

afterEach(() => cleanup())

function Rompedor() {
  throw new Error('boom de render')
}

describe('ErrorBoundary', () => {
  it('muestra pantalla amigable con Recargar página ante fallo de render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Rompedor />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Algo no salió como esperábamos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recargar página/ })).toBeInTheDocument()
    expect(screen.queryByText(/boom de render/)).not.toBeInTheDocument()
    console.error.mockRestore()
  })

  it('renderiza hijos sanos sin alterar', () => {
    render(
      <ErrorBoundary>
        <p>Hola sano</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hola sano')).toBeInTheDocument()
  })

  it('Recargar página recarga window.location', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true, configurable: true })
    render(
      <ErrorBoundary>
        <Rompedor />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: /Recargar página/ }))
    expect(reloadSpy).toHaveBeenCalled()
    console.error.mockRestore()
  })
})
