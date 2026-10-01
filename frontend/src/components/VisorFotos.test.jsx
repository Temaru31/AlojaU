import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import VisorFotos from './VisorFotos'

const FOTOS = [
  'https://a.com/1.jpg',
  'https://a.com/2.jpg',
  'https://a.com/3.jpg',
]

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

const renderVisor = (props = {}) => {
  const onClose = vi.fn()
  render(<VisorFotos fotos={FOTOS} onClose={onClose} {...props} />)
  return { onClose }
}

describe('VisorFotos (lightbox)', () => {
  it('no renderiza nada cuando no hay fotos', () => {
    const { container } = render(<VisorFotos fotos={[]} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra la primera foto con su contador', () => {
    renderVisor()
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
    expect(screen.getByAltText('Foto 1 de 3')).toBeInTheDocument()
  })

  it('respeta initialIndex', () => {
    renderVisor({ initialIndex: 2 })
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
    expect(screen.getByAltText('Foto 3 de 3')).toBeInTheDocument()
  })

  it('Siguiente avanza y envuelve de la última a la primera', () => {
    renderVisor({ initialIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it('Anterior retrocede y envuelve de la primera a la última', () => {
    renderVisor()
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
  })

  it('clic en miniatura salta directo a esa foto', () => {
    renderVisor()
    fireEvent.click(screen.getByRole('button', { name: 'Ver foto 2' }))
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
    expect(screen.getByAltText('Foto 2 de 3')).toBeInTheDocument()
  })

  it('Escape cierra el visor', () => {
    const { onClose } = renderVisor()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('flechas del teclado navegan sin cerrar', () => {
    const { onClose } = renderVisor()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('botón Cerrar y clic fuera llaman onClose', () => {
    const { onClose } = renderVisor()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar visor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar al hacer clic fuera' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('enlace Abrir original apunta a la foto visible', () => {
    renderVisor({ initialIndex: 1 })
    expect(screen.getByRole('link', { name: 'Abrir original' })).toHaveAttribute('href', FOTOS[1])
  })

  it('bloquea el scroll del body y lo restaura al desmontar', () => {
    const { unmount } = render(<VisorFotos fotos={FOTOS} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
