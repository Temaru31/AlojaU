import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { CompararProvider, useComparar } from './CompararContext'

const KEY = 'alojau_comparar'

function Probe() {
  const { comparar, toggle, isSelected, clear, error, canCompare, count, max } = useComparar()
  return (
    <div>
      <span data-testid="list">{comparar.join(',')}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="can">{canCompare ? 'si' : 'no'}</span>
      <span data-testid="count">{count}</span>
      <span data-testid="max">{max}</span>
      <button type="button" onClick={() => toggle(1)}>t1</button>
      <button type="button" onClick={() => toggle(2)}>t2</button>
      <button type="button" onClick={() => toggle(3)}>t3</button>
      <button type="button" onClick={() => toggle(4)}>t4</button>
      <button type="button" onClick={() => toggle(-5)}>tbad</button>
      <button type="button" onClick={clear}>clear</button>
      <span data-testid="sel1">{isSelected(1) ? 'si' : 'no'}</span>
    </div>
  )
}

const renderProbe = () => render(<CompararProvider><Probe /></CompararProvider>)

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('CompararContext (HU-004: máximo 3)', () => {
  it('inicia vacío con localStorage limpio y persiste al agregar', () => {
    renderProbe()
    expect(screen.getByTestId('list').textContent).toBe('')
    expect(screen.getByTestId('max').textContent).toBe('3')
    fireEvent.click(screen.getByText('t1'))
    expect(screen.getByTestId('list').textContent).toBe('1')
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([1])
  })

  it('toggle agrega y retira (isSelected refleja el estado)', () => {
    renderProbe()
    fireEvent.click(screen.getByText('t1'))
    fireEvent.click(screen.getByText('t2'))
    expect(screen.getByTestId('list').textContent).toBe('1,2')
    expect(screen.getByTestId('sel1').textContent).toBe('si')
    fireEvent.click(screen.getByText('t1'))
    expect(screen.getByTestId('list').textContent).toBe('2')
    expect(screen.getByTestId('sel1').textContent).toBe('no')
  })

  it('bloquea el cuarto con error visible y permite seguir tras retirar', () => {
    renderProbe()
    fireEvent.click(screen.getByText('t1'))
    fireEvent.click(screen.getByText('t2'))
    fireEvent.click(screen.getByText('t3'))
    fireEvent.click(screen.getByText('t4'))
    expect(screen.getByTestId('list').textContent).toBe('1,2,3')
    expect(screen.getByTestId('error').textContent).toMatch(/Máximo 3/)
    fireEvent.click(screen.getByText('t1'))
    expect(screen.getByTestId('error').textContent).toBe('')
    fireEvent.click(screen.getByText('t4'))
    expect(screen.getByTestId('list').textContent).toBe('2,3,4')
  })

  it('ignora ids inválidos sin ensuciar el estado', () => {
    renderProbe()
    fireEvent.click(screen.getByText('tbad'))
    expect(screen.getByTestId('list').textContent).toBe('')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('canCompare exige 2 y clear vacía con conteo en 0', () => {
    renderProbe()
    expect(screen.getByTestId('can').textContent).toBe('no')
    fireEvent.click(screen.getByText('t1'))
    expect(screen.getByTestId('can').textContent).toBe('no')
    fireEvent.click(screen.getByText('t2'))
    expect(screen.getByTestId('can').textContent).toBe('si')
    expect(screen.getByTestId('count').textContent).toBe('2')
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('list').textContent).toBe('')
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('hidrata desde localStorage y sanea ids inválidos y exceso', () => {
    localStorage.setItem(KEY, JSON.stringify([2, 99, -1, 1.5, 'x', 3, 4, 5]))
    renderProbe()
    expect(screen.getByTestId('list').textContent).toBe('2,99,3')
  })

  it('JSON corrupto, no-arreglo o vacío arrancan en []', () => {
    localStorage.setItem(KEY, '{roto')
    const { unmount } = renderProbe()
    expect(screen.getByTestId('list').textContent).toBe('')
    unmount()
    cleanup()
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))
    renderProbe()
    expect(screen.getByTestId('list').textContent).toBe('')
  })

  it('evento storage de otra pestaña sincroniza la lista', async () => {
    renderProbe()
    localStorage.setItem(KEY, JSON.stringify([3]))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('3'))
  })

  it('useComparar fuera del provider retorna defaults seguros', () => {
    function Solo() {
      const { comparar, canCompare, count } = useComparar()
      return <span data-testid="solo">{`${comparar.length}-${canCompare}-${count}`}</span>
    }
    render(<Solo />)
    expect(screen.getByTestId('solo').textContent).toBe('0-false-0')
  })
})
