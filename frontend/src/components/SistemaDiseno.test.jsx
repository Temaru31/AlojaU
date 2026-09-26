import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Icono from './Icono'
import PreferenceChip from './PreferenceChip'
import NivelConfianza, { nivelDe } from './NivelConfianza'

afterEach(() => cleanup())

describe('Icono (set ultra-ligero estilo Lucide)', () => {
  it('renderiza trazo por nombre y fallback ante desconocido', () => {
    const { container, rerender } = render(<Icono nombre="mascotas" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    rerender(<Icono nombre="inexistente" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('los 8 de preferencias existen sin lanzar', () => {
    for (const n of ['mascotas', 'silencio', 'humo', 'facultad', 'cocina', 'lavado', 'horario', 'movilidad']) {
      const { unmount } = render(<Icono nombre={n} />)
      expect(document.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
})

describe('PreferenceChip (F1 adiós stickers)', () => {
  it('inactivo vs activo con aria-pressed y sin emojis', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <PreferenceChip icono="mascotas" titulo="Acepto mascotas" hint="Convivo" activa={false} onToggle={onToggle} />
    )
    const btn = screen.getByRole('button', { name: /Acepto mascotas/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn.textContent).not.toMatch(/🐾|🌙|🚬/)
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
    rerender(<PreferenceChip icono="mascotas" titulo="Acepto mascotas" hint="Convivo" activa onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /Acepto mascotas/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('NivelConfianza (F3 radial)', () => {
  it('umbrales UI honestos: verificado solo al 100%', () => {
    expect(nivelDe(100).etiqueta).toBe('Perfil Verificado')
    expect(nivelDe(99).etiqueta).toBe('Perfil Avanzado')
    expect(nivelDe(80).etiqueta).toBe('Perfil Avanzado')
    expect(nivelDe(50).etiqueta).toBe('Perfil Avanzado')
    expect(nivelDe(49).etiqueta).toBe('Perfil Básico')
    expect(nivelDe(0).etiqueta).toBe('Perfil Básico')
  })

  it('muestra porcentaje y etiqueta accesible (un solo role=img)', () => {
    render(<NivelConfianza pct={80} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Perfil Avanzado')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nivel de confianza 80 por ciento/)).toBeInTheDocument()
  })

  it('sujeta valores fuera de rango 0-100', () => {
    const { rerender } = render(<NivelConfianza pct={250} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    rerender(<NivelConfianza pct={-5} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
