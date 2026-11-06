import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useCarga from './useCarga'

describe('useCarga', () => {
  it('carga los datos y deja de estar cargando', async () => {
    const { result } = renderHook(() => useCarga(() => Promise.resolve([1, 2]), [], { inicial: [] }))
    expect(result.current.cargando).toBe(true)
    await waitFor(() => expect(result.current.cargando).toBe(false))
    expect(result.current.datos).toEqual([1, 2])
    expect(result.current.error).toBeNull()
  })

  it('ante un error vuelve al valor inicial y expone el error', async () => {
    const fallo = new Error('red')
    const { result } = renderHook(() => useCarga(() => Promise.reject(fallo), [], { inicial: [] }))
    await waitFor(() => expect(result.current.error).toBe(fallo))
    expect(result.current.datos).toEqual([])
  })

  it('inactivo no pide nada', () => {
    const cargar = vi.fn()
    const { result } = renderHook(() => useCarga(cargar, [], { inicial: 'x', activo: false }))
    expect(cargar).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ datos: 'x', cargando: false })
  })

  it('ignora la respuesta tardía de una carga anterior', async () => {
    const pendientes = {}
    const cargar = (id) => new Promise(res => { pendientes[id] = res })
    const { result, rerender } = renderHook(({ id }) => useCarga(() => cargar(id), [id]), { initialProps: { id: 1 } })
    rerender({ id: 2 })
    await act(async () => { pendientes[2]('aviso 2') })
    await act(async () => { pendientes[1]('aviso 1') })
    expect(result.current.datos).toBe('aviso 2')
  })

  it('setDatos actualiza los datos cargados', async () => {
    const { result } = renderHook(() => useCarga(() => Promise.resolve({ a: 1 }), []))
    await waitFor(() => expect(result.current.datos).toEqual({ a: 1 }))
    act(() => result.current.setDatos(prev => ({ ...prev, b: 2 })))
    expect(result.current.datos).toEqual({ a: 1, b: 2 })
  })
})
