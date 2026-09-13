import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import SearchBar from './SearchBar'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('SearchBar Oleada 2', () => {
  it('aplica debounce de 300ms (no por cada tecla)', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'h' } })
    fireEvent.change(input, { target: { value: 'ha' } })
    fireEvent.change(input, { target: { value: 'hab' } })
    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('hab')
  })

  it('Enter aplica de inmediato', () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tulcan' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('tulcan')
  })

  it('botón × limpia', () => {
    const onChange = vi.fn()
    render(<SearchBar value="hab" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('sincroniza si la URL cambia desde fuera', () => {
    const { rerender } = render(<SearchBar value="uno" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('uno')
    rerender(<SearchBar value="dos" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('dos')
  })
})
