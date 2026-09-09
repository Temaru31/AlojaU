import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Perfil from './Perfil'
import { api } from '../services/api'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Perfil - Perfil verificable + confianza clara', () => {
  it('muestra inicio de sesión si no hay token', () => {
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    expect(screen.getByText(/Debes iniciar sesión/i)).toBeInTheDocument()
    expect(screen.getByText(/Usar mock-token-arrendador/i)).toBeInTheDocument()
  })

  it('carga y muestra perfil con teléfono sin verificar (0 pts)', async () => {
    localStorage.setItem('alojau_token', 'mock-token-test')
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: 1,
        email: 'arrendador@alojau.com',
        nombre_completo: 'Arrendador Demo',
        telefono_whatsapp: '573001234567',
        telefono_verificado: false,
        rol: 'ARRENDADOR',
      }
    })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('arrendador@alojau.com')).toBeInTheDocument()
    })
    expect(screen.getByText(/Sin verificar \(0 pts\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Verificar teléfono/i })).toBeInTheDocument()
  })

  it('permite verificar teléfono en 1 clic y sube a verificado (+20 pts)', async () => {
    const user = userEvent.setup()
    localStorage.setItem('alojau_token', 'mock-token-test')
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: 1,
        email: 'arrendador@alojau.com',
        nombre_completo: 'Arrendador Demo',
        telefono_whatsapp: '573001234567',
        telefono_verificado: false,
        rol: 'ARRENDADOR',
      }
    })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: {
        id: 1,
        email: 'arrendador@alojau.com',
        nombre_completo: 'Arrendador Demo',
        telefono_whatsapp: '573001234567',
        telefono_verificado: true,
        rol: 'ARRENDADOR',
      }
    })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Sin verificar \(0 pts\)/i)).toBeInTheDocument()
    })

    const verifyBtn = screen.getByRole('button', { name: /Verificar teléfono/i })
    await user.click(verifyBtn)

    expect(patchSpy).toHaveBeenCalledWith('/api/auth/perfil', { telefono_verificado: true }, expect.anything())
    await waitFor(() => {
      expect(screen.getByText(/Verificado \(\+20 pts\)/i)).toBeInTheDocument()
    })
  })
})
