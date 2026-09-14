import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CiudadSelector, { CIUDADES_FALLBACK, etiquetaCiudad } from './CiudadSelector'
import { api } from '../services/api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('CiudadSelector', () => {
  it('usa la lista compartida del padre sin fetchear (misma fuente que la píldora)', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: [] })
    const lista = [
      { id: 1, nombre: 'Popayán', departamento: 'Cauca', slug: 'popayan' },
      { id: 2, nombre: 'Cali', departamento: 'Valle del Cauca', slug: 'cali' },
    ]
    render(<CiudadSelector value={2} onChange={vi.fn()} ciudades={lista} />)
    expect(screen.getByTitle('Cali, Valle del Cauca')).toBeInTheDocument()
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('etiquetaCiudad con fallback Popayán', () => {
    expect(etiquetaCiudad(null)).toBe('Popayán, Cauca')
    expect(etiquetaCiudad(CIUDADES_FALLBACK[0])).toBe('Popayán, Cauca')
  })

  it('elige ciudad y notifica onChange', () => {
    const onChange = vi.fn()
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] })
    render(<CiudadSelector value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('option', { name: /Popayán, Cauca/ }))
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
