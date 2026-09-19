import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useDebounce from './useDebounce'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce (Fase 3: evita peticiones por tecla)', () => {
  it('retorna el valor inicial de inmediato sin esperar', () => {
    const { result } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: 'tulcan' } })
    expect(result.current).toBe('tulcan')
  })

  it('actualiza el valor tras el delay configurado', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: 'a' } })
    rerender({ v: 'ab' })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('ab')
  })

  it('cancela el timer anterior si el valor cambia antes del delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: 'a' } })
    rerender({ v: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ v: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('abc')
  })

  it('respeta un delay personalizado distinto de 300ms', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 1000), { initialProps: { v: 'x' } })
    rerender({ v: 'y' })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('x')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('y')
  })
})
