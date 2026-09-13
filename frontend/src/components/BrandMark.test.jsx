import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BrandMark from './BrandMark'

afterEach(() => cleanup())

describe('BrandMark F0', () => {
  it('muestra icono con alt AlojaU', () => {
    render(<MemoryRouter><BrandMark /></MemoryRouter>)
    expect(screen.getByAltText('AlojaU')).toBeInTheDocument()
  })

  it('con texto muestra marca', () => {
    render(<MemoryRouter><BrandMark withText /></MemoryRouter>)
    expect(screen.getByText(/Aloja/)).toBeInTheDocument()
  })
})
