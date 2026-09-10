import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Toaster from './Toast'

afterEach(() => cleanup())

describe('Toaster P-02', () => {
  it('muestra toast global ante evento alojau:toast', async () => {
    render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    )
    window.dispatchEvent(new CustomEvent('alojau:toast', { detail: { message: 'Guardado en favoritos' } }))
    await waitFor(() => expect(screen.getByText('Guardado en favoritos')).toBeInTheDocument())
  })

  it('no renderiza nada sin eventos', () => {
    const { container } = render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    )
    expect(container.innerHTML).toBe('')
  })
})
