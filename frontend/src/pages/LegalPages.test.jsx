import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Terminos from './Terminos'
import Privacidad from './Privacidad'
import { POLITICA_VERSION } from '../components/Legal'

describe('páginas legales honestas (texto completo visible)', () => {
  it('/terminos muestra objeto y conducta', () => {
    render(<BrowserRouter><Terminos /></BrowserRouter>)
    expect(screen.getByRole('heading', { name: /Términos de Servicio/ })).toBeInTheDocument()
    expect(screen.getByText(/No procesamos pagos/)).toBeInTheDocument()
  })

  it('/privacidad muestra versión y derechos', () => {
    render(<BrowserRouter><Privacidad /></BrowserRouter>)
    expect(screen.getAllByText(new RegExp(POLITICA_VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Superintendencia de Industria/)).toBeInTheDocument()
  })
})
