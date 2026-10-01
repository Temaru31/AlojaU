import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import useFocusTrap from './useFocusTrap'

afterEach(() => cleanup())

function Caja({ activo = true }) {
  const ref = useRef(null)
  useFocusTrap(ref, activo)
  return (
    <div ref={ref} role="dialog" aria-label="Caja">
      <button type="button">primero</button>
      <button type="button">segundo</button>
    </div>
  )
}

describe('useFocusTrap (Bloque 3, WCAG 2.1 AA)', () => {
  it('mueve el foco dentro al abrir y cicla con Tab', () => {
    render(<><button type="button">fuera</button><Caja /></>)
    // Foco inicial cae al primer control del diálogo.
    expect(screen.getByRole('button', { name: 'primero' })).toHaveFocus()
    // Tab en el último vuelve al primero.
    screen.getByRole('button', { name: 'segundo' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'primero' })).toHaveFocus()
    // Shift+Tab en el primero va al último.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'segundo' })).toHaveFocus()
  })

  it('inactivo no toca el foco ni intercepta Tab', () => {
    render(<><button type="button">fuera</button><Caja activo={false} /></>)
    expect(screen.getByRole('button', { name: 'fuera' })).not.toHaveFocus()
    expect(document.activeElement?.textContent).not.toBe('primero')
  })

  it('al desmontar restaura el foco al disparador', () => {
    const { rerender } = render(<button type="button">disparador</button>)
    screen.getByRole('button', { name: 'disparador' }).focus()
    // Al abrir, el hook captura el foco previo y mueve al diálogo...
    rerender(<><button type="button">disparador</button><Caja /></>)
    expect(screen.getByRole('button', { name: 'primero' })).toHaveFocus()
    // ...y al cerrar lo devuelve al disparador.
    rerender(<button type="button">disparador</button>)
    expect(screen.getByRole('button', { name: 'disparador' })).toHaveFocus()
  })
})
