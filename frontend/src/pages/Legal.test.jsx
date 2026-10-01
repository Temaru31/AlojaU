import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Terminos from './Terminos'
import Privacidad from './Privacidad'
import { POLITICA_VERSION } from '../components/Legal'

afterEach(() => cleanup())

describe('Páginas legales (Ley 1581)', () => {
  it('Términos renderiza el texto completo con navegación', () => {
    render(<MemoryRouter><Terminos /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /Términos de Servicio/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/')
  })

  it('Privacidad muestra versión de política vigente', () => {
    render(<MemoryRouter><Privacidad /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /Política de Tratamiento/ })).toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(POLITICA_VERSION)).length).toBeGreaterThanOrEqual(1)
  })
})
