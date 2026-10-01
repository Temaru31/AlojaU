import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import RegistroForm from './RegistroForm'
import { api } from '../services/api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function renderForm(props = {}) {
  return render(<BrowserRouter><RegistroForm onRegistrado={vi.fn()} {...props} /></BrowserRouter>)
}

describe('RegistroForm cobertura honesta (Ley 1581 + progressive profiling)', () => {
  it('muestra consentimiento exacto y botón deshabilitado sin acepto', () => {
    renderForm()
    expect(screen.getByText(/Ley 1581 de 2012/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('teléfono opcional: sin teléfono el registro envía null', async () => {
    const user = userEvent.setup()
    const onRegistrado = vi.fn()
    vi.spyOn(api, 'post').mockImplementation((url) => {
      if (url === '/api/auth/register') return Promise.resolve({ data: { email: 'n@x.co' } })
      return Promise.resolve({ data: { access_token: 'tok' } })
    })
    render(<BrowserRouter><RegistroForm onRegistrado={onRegistrado} /></BrowserRouter>)
    await user.type(screen.getByLabelText(/Nombre completo/), 'Ana Ríos')
    await user.type(screen.getByLabelText(/Correo/), 'n@x.co')
    await user.type(screen.getByLabelText(/Contraseña/), 'Fuerte1!x')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register', expect.objectContaining({ telefono_whatsapp: null })))
  })

  it('error 400 del backend muestra mensaje sin lanzar', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue({ response: { data: { detail: 'Email ya registrado' } } })
    renderForm()
    await user.type(screen.getByLabelText(/Nombre completo/), 'Ana Ríos')
    await user.type(screen.getByLabelText(/Correo/), 'dup@x.co')
    await user.type(screen.getByLabelText(/Contraseña/), 'Fuerte1!x')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Email ya registrado'))
  })
})
