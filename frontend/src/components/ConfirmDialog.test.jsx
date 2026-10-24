import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'

afterEach(() => cleanup())

describe('ConfirmDialog (hilo único de confirmación)', () => {
  it('muestra título, descripción y ambos botones explícitos', () => {
    render(
      <ConfirmDialog
        titulo="¿Eliminar esta publicación?"
        descripcion="No se puede deshacer."
        cancelar="Cancelar"
        confirmar="Sí, eliminar"
        peligro
        onCancelar={() => {}}
        onConfirmar={() => {}}
      />
    )
    expect(screen.getByRole('dialog', { name: '¿Eliminar esta publicación?' })).toBeInTheDocument()
    expect(screen.getByText('No se puede deshacer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sí, eliminar' })).toBeInTheDocument()
  })

  it('Escape y backdrop cancelan (salvo ocupado)', () => {
    const onCancelar = vi.fn()
    render(
      <ConfirmDialog titulo="T" onCancelar={onCancelar} onConfirmar={() => {}} />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('ocupado deshabilita todo y muestra procesando', () => {
    render(
      <ConfirmDialog titulo="T" confirmar="Sí, eliminar" ocupado onCancelar={() => {}} onConfirmar={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('confirmarDeshabilitado bloquea con guía sin cerrar', () => {
    const onConfirmar = vi.fn()
    render(
      <ConfirmDialog titulo="T" confirmar="Sí, eliminar mi cuenta" confirmarDeshabilitado onCancelar={() => {}} onConfirmar={onConfirmar} />
    )
    const btn = screen.getByRole('button', { name: 'Sí, eliminar mi cuenta' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onConfirmar).not.toHaveBeenCalled()
  })
})
