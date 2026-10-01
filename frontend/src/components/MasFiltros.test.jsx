import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasFiltrosModal, AtajosPresupuesto, SelectorTipoChips, contarAvanzados } from './Filtros'

describe('MasFiltrosModal (drawer desktop espejo del sheet móvil)', () => {
  it('badge reutiliza contarAvanzados y abre diálogo', () => {
    const filtros = { min: '100', max: '', tipo: '', servicios: '4' }
    expect(contarAvanzados(filtros)).toBe(2)
    render(<MasFiltrosModal filtros={filtros} setFiltros={() => {}} />)
    expect(screen.getByLabelText(/Abrir más filtros, 2 activos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    expect(screen.getByRole('dialog', { name: /Más filtros/ })).toBeInTheDocument()
  })

  it('drawer trae los 3 bloques numerados como el móvil (paridad)', () => {
    render(<MasFiltrosModal filtros={{ min: '', max: '', tipo: '', servicios: '' }} setFiltros={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    expect(screen.getByText('1 · Presupuesto (COP)')).toBeInTheDocument()
    expect(screen.getByText('2 · Tipo de inmueble')).toBeInTheDocument()
    expect(screen.getByText('3 · Servicios y comodidades')).toBeInTheDocument()
    // Mismos atajos y todos los servicios (no solo secundarios).
    expect(screen.getByRole('button', { name: '< $400 mil' })).toBeInTheDocument()
    expect(screen.getByLabelText('Amoblado')).toBeInTheDocument()
    expect(screen.getByLabelText('WiFi Fibra')).toBeInTheDocument()
  })

  it('chips de tipo envueltos en desktop (sin scroll táctil)', () => {
    render(<MasFiltrosModal filtros={{ min: '', max: '', tipo: '', servicios: '' }} setFiltros={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    const grupo = screen.getByRole('group', { name: 'Tipo de inmueble' })
    expect(grupo.className).toMatch('flex-wrap')
    expect(grupo.className).not.toMatch('overflow-x-auto')
  })

  it('CTA muestra conteo en vivo y Limpiar resetea todo', () => {
    const setFiltros = vi.fn()
    render(<MasFiltrosModal filtros={{ min: '0', max: '400000', tipo: '', servicios: '' }} setFiltros={setFiltros} totalResultados={13} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    expect(screen.getByRole('button', { name: 'Mostrar 13 alojamientos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todos los filtros' }))
    expect(setFiltros).toHaveBeenCalledWith({ min: '', max: '', tipo: '', servicios: '' })
  })

  it('sin filtros no muestra badge y CTA dice Ver resultados', () => {
    render(<MasFiltrosModal filtros={{ min: '', max: '', tipo: '', servicios: '' }} setFiltros={() => {}} totalResultados={0} />)
    expect(screen.queryByText(/activos/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir más filtros/ }))
    expect(screen.getByRole('button', { name: 'Ver resultados' })).toBeInTheDocument()
  })
})

describe('AtajosPresupuesto + SelectorTipoChips (fuente única)', () => {
  it('atajo escribe min/max y pulsar el activo limpia', () => {
    const setFiltros = vi.fn()
    let filtros = { min: '', max: '', tipo: '', servicios: '' }
    const { rerender } = render(<AtajosPresupuesto filtros={filtros} setFiltros={(f) => { filtros = f; setFiltros(f) }} />)
    fireEvent.click(screen.getByRole('button', { name: '< $400 mil' }))
    expect(setFiltros).toHaveBeenCalledWith(expect.objectContaining({ min: '0', max: '400000' }))
    rerender(<AtajosPresupuesto filtros={filtros} setFiltros={setFiltros} />)
    expect(screen.getByRole('button', { name: '< $400 mil' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('chips de tipo marcan el activo', () => {
    render(<SelectorTipoChips filtros={{ tipo: '' }} setFiltros={() => {}} />)
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
  })
})
