import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToastLocal } from './useDatosDetalle'

afterEach(() => vi.useRealTimers())

describe('useToastLocal', () => {
  it('un segundo toast reinicia el temporizador del primero', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToastLocal(1000))
    act(() => result.current.mostrarToast('uno'))
    act(() => vi.advanceTimersByTime(800))
    act(() => result.current.mostrarToast('dos'))
    act(() => vi.advanceTimersByTime(800))
    expect(result.current.toast).toBe('dos')
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.toast).toBe('')
  })

  it('al desmontar cancela el temporizador pendiente', () => {
    vi.useFakeTimers()
    const limpiar = vi.spyOn(window, 'clearTimeout')
    const { result, unmount } = renderHook(() => useToastLocal(1000))
    act(() => result.current.mostrarToast('hola'))
    const llamadasAntes = limpiar.mock.calls.length
    unmount()
    expect(limpiar.mock.calls.length).toBe(llamadasAntes + 1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
