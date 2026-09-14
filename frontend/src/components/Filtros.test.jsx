import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Filtros, { contarAvanzados } from './Filtros'

afterEach(()=> cleanup())

describe('Filtros - HU-002 + Fase 3 avanzados', ()=>{
  it('muestra botón desplegable con badge cuando hay filtros activos', ()=>{
    render(<Filtros filtros={{ tipo: 'APARTAESTUDIO', servicios: '1,4' }} setFiltros={vi.fn()} defaultOpen />)
    expect(screen.getByRole('button', { name: /Filtros avanzados/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/3 filtros activos/)).toBeInTheDocument()
  })

  it('desplegado muestra precio, tipo y servicios', ()=>{
    render(<Filtros filtros={{}} setFiltros={vi.fn()} defaultOpen />)
    expect(screen.getByPlaceholderText('Min COP')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Max COP')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Todos los tipos')).toBeInTheDocument()
    expect(screen.getByLabelText('WiFi Fibra')).toBeInTheDocument()
  })

  it('contarAvanzados incluye precio', ()=>{
    expect(contarAvanzados({})).toBe(0)
    expect(contarAvanzados({ min: '100', max: '200', tipo: 'APARTAESTUDIO', servicios: '1,4' })).toBe(5)
  })

  it('soloPanel rinde campos sin cabecera toggle', ()=>{
    render(<Filtros filtros={{}} setFiltros={vi.fn()} soloPanel />)
    expect(screen.queryByRole('button', { name: /Filtros avanzados/ })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Min COP')).toBeInTheDocument()
  })

  it('cambia tipo', ()=>{
    const setFiltros = vi.fn()
    render(<Filtros filtros={{tipo:''}} setFiltros={setFiltros} defaultOpen />)
    const select = screen.getByDisplayValue('Todos los tipos')
    fireEvent.change(select, { target: { value: 'APARTAESTUDIO' }})
    expect(setFiltros).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'APARTAESTUDIO' }))
  })

  it('botón Limpiar resetea avanzados (incluye precio)', ()=>{
    const setFiltros = vi.fn()
    render(<Filtros filtros={{min:'100', max:'200', tipo:'APARTAESTUDIO'}} setFiltros={setFiltros} defaultOpen />)
    fireEvent.click(screen.getByText('Limpiar filtros'))
    expect(setFiltros).toHaveBeenCalledWith(expect.objectContaining({ min: '', max: '', tipo: '', servicios: '' }))
  })

  it('incluye opción HABITACION_INDEPENDIENTE (fix previo faltante)', ()=>{
    render(<Filtros filtros={{}} setFiltros={vi.fn()} defaultOpen />)
    expect(screen.getByText('Habitacion independiente')).toBeInTheDocument()
  })
})
