// M1: tooltip híbrido (tap móvil + cierre afuera/Escape).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import InfoTooltip from './InfoTooltip'

afterEach(() => cleanup())

describe('InfoTooltip (M1)', () => {
  it('oculto por defecto, tap lo abre y clic afuera lo cierra', () => {
    render(
      <div>
        <span data-testid="fuera">fuera</span>
        <InfoTooltip texto="Ayuda de prueba" />
      </div>,
    )
    const tip = screen.getByText('Ayuda de prueba')
    expect(tip).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Más información/ }))
    expect(tip).toHaveAttribute('aria-hidden', 'false')
    expect(tip).toHaveAttribute('role', 'tooltip')
    fireEvent.mouseDown(screen.getByTestId('fuera'))
    expect(tip).toHaveAttribute('aria-hidden', 'true')
  })

  it('Escape lo cierra', () => {
    render(<InfoTooltip texto="Ayuda escape" />)
    fireEvent.click(screen.getByRole('button', { name: /Más información/ }))
    expect(screen.getByText('Ayuda escape')).toHaveAttribute('aria-hidden', 'false')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Ayuda escape')).toHaveAttribute('aria-hidden', 'true')
  })

  it('hover lo muestra sin fijar', () => {
    render(<InfoTooltip texto="Ayuda hover" />)
    const btn = screen.getByRole('button', { name: /Más información/ })
    fireEvent.mouseEnter(btn.parentElement)
    expect(screen.getByText('Ayuda hover')).toHaveAttribute('aria-hidden', 'false')
  })
})
