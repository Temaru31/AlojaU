import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Indice from './IndiceConfianza'

afterEach(()=> cleanup())

describe('IndiceConfianza - HU-007 amigable', ()=>{
  it('muestra puntaje y etiqueta amigable', ()=>{
    render(<Indice indice={95} desglose={{completitud:40, telefono:20, fotos:15, vigencia:15, reportes:10}} />)
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText(/Confianza Alta/)).toBeInTheDocument()
    expect(screen.getByText(/Se ve bien/)).toBeInTheDocument()
  })
  it('muestra mensaje diferente para confianza baja', ()=>{
    render(<Indice indice={30} desglose={{completitud:10, telefono:0, fotos:0, vigencia:0, reportes:0}} />)
    expect(screen.getByText(/Confianza Básica/)).toBeInTheDocument()
    expect(screen.getByText(/Revisa con calma/)).toBeInTheDocument()
  })
  it('sin reportes (0 denuncias): 10/10 con check verde', async ()=>{
    const user = userEvent.setup()
    render(<Indice indice={100} desglose={{completitud:40, telefono:20, fotos:15, vigencia:15, reportes:10}} />)
    await user.click(screen.getByRole('button', { name: /Ver por qué/ }))
    expect(screen.getByText('Sin reportes')).toBeInTheDocument()
    expect(screen.getByText('10/10')).toBeInTheDocument()
    // checks verdes: 5 factores ok -> 5 ✓ (más el de la insignia si aplica)
    expect(screen.getAllByText('✓').length).toBeGreaterThanOrEqual(5)
  })
  it('anillo SVG con avance proporcional y colores dinámicos', ()=>{
    const { container, rerender } = render(<Indice indice={50} desglose={{completitud:20, telefono:10, fotos:10, vigencia:5, reportes:5}} />)
    const anillo = container.querySelector('svg[aria-label="Confianza 50 de 100"] circle[stroke-dasharray]')
    expect(anillo).toBeInTheDocument()
    // 50% de C≈163.36 -> 81.7
    expect(anillo.getAttribute('stroke-dasharray')).toMatch(/^81\.7/)
    expect(anillo.getAttribute('stroke')).toBe('#f59e0b') // Amarillo >50
    rerender(<Indice indice={95} desglose={{}} />)
    expect(container.querySelector('circle[stroke-dasharray]').getAttribute('stroke')).toBe('#10b981') // Verde >80
    rerender(<Indice indice={30} desglose={{}} />)
    expect(container.querySelector('circle[stroke-dasharray]').getAttribute('stroke')).toBe('#ef4444') // Rojo <50
  })
  it('desplegable muestra detalles amigables al hacer click', async ()=>{
    const user = userEvent.setup()
    render(<Indice indice={80} desglose={{completitud:40, telefono:20, fotos:15, vigencia:15, reportes:10}} />)
    expect(screen.queryByTestId('detalles')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ver por qué/ }))
    expect(screen.getByTestId('detalles')).toBeInTheDocument()
    expect(screen.getAllByText(/Información completa/).length).toBeGreaterThan(0)
    expect(screen.getByText(/WhatsApp verificado/)).toBeInTheDocument()
    expect(screen.getByText(/Fotos suficientes/)).toBeInTheDocument()
  })
  it('oculta detalles al segundo click', async ()=>{
    const user = userEvent.setup()
    render(<Indice indice={80} desglose={{completitud:40, telefono:20, fotos:15, vigencia:5, reportes:10}} />)
    const btn = screen.getByRole('button', { name: /Ver por qué/ })
    await user.click(btn)
    expect(screen.getByTestId('detalles')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ocultar detalles/ }))
    expect(screen.queryByTestId('detalles')).not.toBeInTheDocument()
  })
  it('no desborda en móvil (min-w-0)', ()=>{
    const { container } = render(<Indice indice={100} desglose={{completitud:40, telefono:20, fotos:15, vigencia:15, reportes:10}} />)
    expect(container.firstChild.className).toContain('min-w-0')
  })
})
