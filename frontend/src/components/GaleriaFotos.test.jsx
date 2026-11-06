import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import GaleriaFotos from './GaleriaFotos'

const T = 'Habitación Tulcán'
const F3 = ['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg']
const F5 = ['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg', 'https://a.com/4.jpg', 'https://a.com/5.jpg']
const F6 = [...F5, 'https://a.com/6.jpg']

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('GaleriaFotos (responsive +N + visor)', () => {
  it('sin fotos muestra el placeholder', () => {
    const { container } = render(<GaleriaFotos fotos={[]} titulo={T} />)
    expect(screen.getByText('Sin fotos')).toBeInTheDocument()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('celda principal abre el visor en la foto 1', () => {
    render(<GaleriaFotos fotos={F3} titulo={T} />)
    const celdas = screen.getAllByRole('button', { name: `Abrir visor: ${T} foto 1 de 3` })
    fireEvent.click(celdas[0])
    expect(screen.getByRole('dialog', { name: 'Visor de fotos' })).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it('teclado Enter abre y otra tecla no', () => {
    render(<GaleriaFotos fotos={F3} titulo={T} />)
    const celda = screen.getByRole('button', { name: `Abrir visor: ${T} foto 2 de 3` })
    fireEvent.keyDown(celda, { key: 'a' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(celda, { key: 'Enter' })
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  it('mini thumbs (2-3 fotos) saltan a su foto', () => {
    render(<GaleriaFotos fotos={F3} titulo={T} />)
    fireEvent.click(screen.getByRole('button', { name: `Abrir visor: ${T} mini 3` }))
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
  })

  it('botón +N móvil abre el visor en la foto 2', () => {
    render(<GaleriaFotos fotos={F5} titulo={T} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver 4 fotos más' }))
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument()
  })

  it('badge +N desktop abre desde la quinta foto', () => {
    render(<GaleriaFotos fotos={F6} titulo={T} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver 2 fotos más' }))
    expect(screen.getByText(/5 \/ 6/)).toBeInTheDocument()
  })

  it('contador discreto según total (todas visibles vs ocultas)', () => {
    const { unmount } = render(<GaleriaFotos fotos={F3} titulo={T} />)
    expect(screen.getByText(/3 fotos • Haz clic para abrir visor • todas visibles/)).toBeInTheDocument()
    unmount()
    cleanup()
    render(<GaleriaFotos fotos={F6} titulo={T} />)
    expect(screen.getByText(/\+2 ocultas en grid, visibles en visor/)).toBeInTheDocument()
  })

  it('con exactamente 4 fotos muestra el badge de conteo', () => {
    render(<GaleriaFotos fotos={F3.concat('https://a.com/4.jpg')} titulo={T} />)
    expect(screen.getAllByText('4 fotos').length).toBeGreaterThanOrEqual(1)
  })

  it('el visor abierto se cierra con Escape (integración)', () => {
    render(<GaleriaFotos fotos={F3} titulo={T} />)
    const celdas = screen.getAllByRole('button', { name: `Abrir visor: ${T} foto 1 de 3` })
    fireEvent.click(celdas[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
