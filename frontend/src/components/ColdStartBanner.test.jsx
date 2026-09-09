import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import ColdStartBanner from './ColdStartBanner'

afterEach(() => cleanup())

describe('ColdStartBanner', () => {
  it('oculto cuando backend responde rápido', () => {
    render(<ColdStartBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('visible tras evento slow-start y se oculta en slow-end', () => {
    render(<ColdStartBanner />)
    act(() => {
      window.dispatchEvent(new CustomEvent('alojau:api-slow-start'))
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Despertando el servidor/)).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new CustomEvent('alojau:api-slow-end'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
