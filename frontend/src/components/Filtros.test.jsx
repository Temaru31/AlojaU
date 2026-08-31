import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Filtros from './Filtros'

afterEach(()=> cleanup())

describe('Filtros - HU-002', ()=>{
  it('renderiza inputs sin desbordar (responsive)', ()=>{
    const { container } = render(<Filtros filtros={{}} setFiltros={vi.fn()} />)
    expect(screen.getByPlaceholderText('Min COP')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Max COP')).toBeInTheDocument()
    // grid responsive
    expect(container.querySelector('.grid')).toBeInTheDocument()
  })

  it('llama setFiltros al cambiar Min', ()=>{
    const setFiltros = vi.fn()
    render(<Filtros filtros={{}} setFiltros={setFiltros} />)
    fireEvent.change(screen.getByPlaceholderText('Min COP'), { target: { value: '400000' }})
    expect(setFiltros).toHaveBeenCalledWith(expect.objectContaining({ min: '400000' }))
  })

  it('cambia tipo', ()=>{
    const setFiltros = vi.fn()
    render(<Filtros filtros={{tipo:''}} setFiltros={setFiltros} />)
    const select = screen.getByDisplayValue('Tipo')
    fireEvent.change(select, { target: { value: 'APARTAESTUDIO' }})
    expect(setFiltros).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'APARTAESTUDIO' }))
  })

  it('botón Limpiar resetea', ()=>{
    const setFiltros = vi.fn()
    render(<Filtros filtros={{min:'100', max:'200'}} setFiltros={setFiltros} />)
    fireEvent.click(screen.getByText('Limpiar'))
    expect(setFiltros).toHaveBeenCalledWith({})
  })

  it('incluye opción HABITACION_INDEPENDIENTE (fix previo faltante)', ()=>{
    render(<Filtros filtros={{}} setFiltros={vi.fn()} />)
    expect(screen.getByText('Habitación independiente')).toBeInTheDocument()
  })
})
