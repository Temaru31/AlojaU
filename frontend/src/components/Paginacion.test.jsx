import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Paginacion from './Paginacion'

afterEach(()=> cleanup())

describe('Paginacion - HU-001/002', ()=>{
  it('cuando solo 1 página muestra texto simple sin botones prev/next', ()=>{
    render(<Paginacion page={1} pages={1} total={6} onPage={vi.fn()} />)
    expect(screen.getByText(/Mostrando 6 resultados/)).toBeInTheDocument()
    expect(screen.queryByText('Anterior')).not.toBeInTheDocument()
    expect(screen.queryByText('Siguiente')).not.toBeInTheDocument()
  })

  it('muestra Total y Página cuando hay varias páginas', ()=>{
    render(<Paginacion page={1} pages={3} total={6} onPage={vi.fn()} />)
    expect(screen.getByText(/Total 6 • Página 1 de 3/)).toBeInTheDocument()
  })

  it('deshabilita Anterior en primera página y habilita Siguiente', ()=>{
    render(<Paginacion page={1} pages={3} total={6} onPage={vi.fn()} />)
    const anterior = screen.getByText('Anterior')
    const siguiente = screen.getByText('Siguiente')
    expect(anterior).toBeDisabled()
    expect(siguiente).not.toBeDisabled()
  })

  it('deshabilita Siguiente en última página', ()=>{
    render(<Paginacion page={3} pages={3} total={6} onPage={vi.fn()} />)
    expect(screen.getByText('Siguiente')).toBeDisabled()
    expect(screen.getByText('Anterior')).not.toBeDisabled()
  })

  it('resalta página actual con aria-current', ()=>{
    render(<Paginacion page={2} pages={3} total={6} onPage={vi.fn()} />)
    const active = screen.getByText('2')
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.className).toContain('bg-indigo-600')
  })

  it('llama onPage al hacer click en número y en Anterior/Siguiente', ()=>{
    const onPage = vi.fn()
    render(<Paginacion page={2} pages={3} total={6} onPage={onPage} />)
    fireEvent.click(screen.getByText('1'))
    expect(onPage).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByText('Siguiente'))
    expect(onPage).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByText('Anterior'))
    expect(onPage).toHaveBeenCalledWith(1)
  })

  it('muestra ellipsis cuando hay muchas páginas', ()=>{
    render(<Paginacion page={2} pages={10} total={100} onPage={vi.fn()} />)
    // debe mostrar ... entre start-end y última página
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('maneja total 0 sin romper', ()=>{
    render(<Paginacion page={1} pages={1} total={0} onPage={vi.fn()} />)
    expect(screen.getByText(/Mostrando 0 resultados/)).toBeInTheDocument()
  })
})
