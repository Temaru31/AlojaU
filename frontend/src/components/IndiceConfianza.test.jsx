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
  it('barra visual con width proporcional', ()=>{
    const { container } = render(<Indice indice={50} desglose={{completitud:20, telefono:10, fotos:10, vigencia:5, reportes:5}} />)
    // barra es el div con width inline dentro de bg-gray-200
    const bar = container.querySelector('div[style*="50%"]')
    expect(bar).toBeInTheDocument()
    expect(bar.style.width).toBe('50%')
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
