import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasFiltrosModal, contarAvanzados } from './Filtros'

describe('MasFiltrosModal (M4 secundarios en drawer desktop)', () => {
  it('badge reutiliza contarAvanzados y abre diálogo', () => {
    const filtros = { min: '100', max: '', tipo: '', servicios: '4' }
    expect(contarAvanzados(filtros)).toBe(2)
    render(<MasFiltrosModal filtros={filtros} setFiltros={() => {}} />)
    expect(screen.getByLabelText(/Abrir más filtros, 2 activos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    expect(screen.getByRole('dialog', { name: /Más filtros/ })).toBeInTheDocument()
    expect(screen.getByText(/Servicios adicionales/)).toBeInTheDocument()
  })

  it('sin filtros no muestra badge', () => {
    render(<MasFiltrosModal filtros={{ min: '', max: '', tipo: '', servicios: '' }} setFiltros={() => {}} />)
    expect(screen.queryByText(/activos/)).not.toBeInTheDocument()
  })
})
