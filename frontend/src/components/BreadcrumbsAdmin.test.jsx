import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import BreadcrumbsAdmin from './BreadcrumbsAdmin'

describe('BreadcrumbsAdmin (M1 jerárquicos unificados)', () => {
  it('desktop: Inicio › Panel Admin › [Pestaña]', () => {
    render(<BrowserRouter><BreadcrumbsAdmin actual="Moderación" /></BrowserRouter>)
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Panel Admin')).toBeInTheDocument()
    expect(screen.getByText('Moderación')).toBeInTheDocument()
  })

  it('móvil: colapsa a ← Volver al Panel', () => {
    render(<BrowserRouter><BreadcrumbsAdmin actual="Reportes" volverA="/admin/dashboard" volverTexto="Panel" /></BrowserRouter>)
    expect(screen.getByRole('link', { name: /Volver al Panel/ })).toHaveAttribute('href', '/admin/dashboard')
  })
})
