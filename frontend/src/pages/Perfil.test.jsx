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
  it('muestra inicio de sesión si no hay token (sin credenciales demo expuestas)', () => {
    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )
    expect(screen.getByText(/Debes iniciar sesión/i)).toBeInTheDocument()
    // D-20: ni credenciales ni mock-token visibles en UI
    expect(screen.queryByText(/Usar mock-token-arrendador/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/arrendador@alojau\.com/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/AlojaU123/i)).not.toBeInTheDocument()
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
    // OLA2-M4: sin botón de auto-verificación; la verificación la otorga un administrador
    expect(screen.queryByRole('button', { name: /Verificar teléfono/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Un administrador debe verificar tu línea/i)).toBeInTheDocument()
  })

  it('al guardar NO envía telefono_verificado al backend (solo-lectura OLA2-M4)', async () => {
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
      expect(screen.getByText(/Sin verificar \(0 pts\)/i)).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /Guardar número/i })
    await user.click(saveBtn)

    expect(patchSpy).toHaveBeenCalledOnce()
    const sentBody = patchSpy.mock.calls[0][1]
    expect(sentBody).not.toHaveProperty('telefono_verificado')
  })

  it('rol ADMIN ve banner maestro + acceso al dashboard', async () => {
    localStorage.setItem('alojau_token', 'mock-token-admin')
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/admin/metricas') {
        return Promise.resolve({ data: { pendientes: 2, reportes_pendientes: 1 } })
      }
      return Promise.resolve({
        data: {
          id: 2, email: 'admin@alojau.com', nombre_completo: 'Admin AlojaU',
          telefono_whatsapp: '573009999999', telefono_verificado: true, rol: 'ADMIN',
        }
      })
    })

    render(
      <BrowserRouter>
        <Perfil />
      </BrowserRouter>
    )

    expect(await screen.findByText(/Modo Administrador Maestro/)).toBeInTheDocument()
    expect(await screen.findByText(/2 avisos por revisar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir panel admin/ })).toHaveAttribute('href', '/admin/dashboard')
  })
})
