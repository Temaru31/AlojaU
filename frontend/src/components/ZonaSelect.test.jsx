import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ZonaSelect, { resolverBarrio, BARRIOS_POPAYAN } from './ZonaSelect'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { get: vi.fn(async () => ({ data: [] })) } }))

afterEach(() => cleanup())

const ZONAS = [
  { id: 1, nombre: 'Centro' },
  { id: 3, nombre: 'Tulcán' },
]

describe('resolverBarrio', () => {
  it('matchea zona insensible a tildes/mayúsculas', () => {
    expect(resolverBarrio('tulcan', ZONAS)).toMatchObject({ zona_barrio_id: 3, barrio_texto: null })
    expect(resolverBarrio('  TULCÁN ', ZONAS)).toMatchObject({ zona_barrio_id: 3 })
  })

  it('desconocido viaja como barrio libre (máx 120)', () => {
    const r = resolverBarrio('Santa Inés', ZONAS)
    expect(r).toMatchObject({ zona_barrio_id: null, barrio_texto: 'Santa Inés' })
    expect(resolverBarrio('', ZONAS)).toMatchObject({ zona_barrio_id: null, barrio_texto: null })
  })

  it('catálogo inicial trae los 15 barrios', () => {
    expect(BARRIOS_POPAYAN).toHaveLength(15)
    expect(BARRIOS_POPAYAN).toContain('Rincón de la Estancia')
  })
})

describe('ZonaSelect', () => {
  it('datalist con catálogo + error visible', () => {
    render(<ZonaSelect value={{ zona_barrio_id: null, barrio_texto: null }} onChange={vi.fn()} error="Elige tu barrio" />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(document.querySelectorAll('#zona-barrio-lista option').length).toBeGreaterThanOrEqual(15)
    expect(screen.getByText('Elige tu barrio')).toBeInTheDocument()
  })

  it('escribir zona conocida resuelve id; libre avisa personalizado', () => {
    const onChange = vi.fn()
    render(<ZonaSelect value={{ zona_barrio_id: null, barrio_texto: null }} onChange={onChange} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Tulcán' } })
    // Sin zonas de API, Tulcán no resuelve id pero se acepta como libre.
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ barrio_texto: 'Tulcán' }))
    expect(screen.getByText(/barrio personalizado/)).toBeInTheDocument()
  })
})
