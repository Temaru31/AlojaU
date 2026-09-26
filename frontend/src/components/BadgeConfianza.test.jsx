import { describe, it, expect, vi, afterEach } from 'vitest'
import { nivelConfianza } from './BadgeConfianza'
import Badge from './BadgeConfianza'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

describe('BadgeConfianza', () => {
  it('niveles por rango (80/50)', () => {
    expect(nivelConfianza(100)).toBe('alto')
    expect(nivelConfianza(80)).toBe('alto')
    expect(nivelConfianza(79)).toBe('medio')
    expect(nivelConfianza(50)).toBe('medio')
    expect(nivelConfianza(49)).toBe('bajo')
    expect(nivelConfianza(null)).toBe('bajo')
  })

  it('píldora minimalista con tooltip y aria', () => {
    render(<Badge indice={65} />)
    const pill = screen.getByLabelText('Confianza Media: 65 de 100')
    expect(pill).toHaveTextContent('🟡')
    expect(pill).toHaveTextContent('65')
    expect(pill).toHaveAttribute('title', 'Confianza Media: 65/100')
  })
})
