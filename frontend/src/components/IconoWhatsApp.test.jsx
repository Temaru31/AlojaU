import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import IconoWhatsApp from './IconoWhatsApp'

describe('IconoWhatsApp (logo vectorial oficial)', () => {
  it('renderiza SVG decorativo sin emojis ni texto', () => {
    const { container } = render(<IconoWhatsApp />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText('💬')).not.toBeInTheDocument()
  })
})
