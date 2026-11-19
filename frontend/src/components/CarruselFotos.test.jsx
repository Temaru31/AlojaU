import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CarruselFotos from './CarruselFotos'

afterEach(() => cleanup())

const FOTOS = ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg']

describe('CarruselFotos (R7 táctil)', () => {
  it('sin fotos muestra vacío', () => {
    render(<CarruselFotos fotos={[]} titulo="Aviso" />)
    expect(screen.getByText('Sin fotos')).toBeInTheDocument()
  })

  it('contador 1/3 y flechas navegan el índice', () => {
    render(<CarruselFotos fotos={FOTOS} titulo="Aviso" />)
    expect(screen.getByLabelText('Foto 1 de 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByLabelText('Foto 2 de 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Foto anterior' }))
    expect(screen.getByLabelText('Foto 1 de 3')).toBeInTheDocument()
  })

  it('primera/última deshabilitan su flecha', () => {
    render(<CarruselFotos fotos={FOTOS} titulo="Aviso" />)
    expect(screen.getByRole('button', { name: 'Foto anterior' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeDisabled()
  })

  it('tap abre el visor en esa foto y se puede cerrar', () => {
    render(<CarruselFotos fotos={FOTOS} titulo="Aviso" />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 2 de 3' }))
    expect(screen.getByRole('dialog', { name: 'Visor de fotos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar visor' }))
    expect(screen.queryByRole('dialog', { name: 'Visor de fotos' })).not.toBeInTheDocument()
  })

  it('renderiza acciones flotantes sobre la imagen', () => {
    render(<CarruselFotos fotos={FOTOS} titulo="Aviso" acciones={<button type="button" aria-label="flotante-test">x</button>} />)
    expect(screen.getByRole('button', { name: 'flotante-test' })).toBeInTheDocument()
  })
})
