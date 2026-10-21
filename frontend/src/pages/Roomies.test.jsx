import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Roomies from './Roomies'
import * as apiModule from '../services/api'
import * as authContextModule from '../contexts/AuthContext'

describe('Roomies page', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 1,
        nombre_completo: 'Estudiante Demo',
        email: 'estudiante@alojau.com',
        rol: 'ESTUDIANTE',
        preferencias: {
          'roomie.aseo_momento_semana': 'entre_semana',
          'roomie.aseo_horario': 'manana_6am_11am',
          'roomie.rasgos_negativos': ['impaciente', 'malhumorado'],
          'roomie.sueno_hora_dormir': '23:00',
        },
      },
      token: 'mock-token-estudiante',
    })

    vi.spyOn(apiModule.api, 'get').mockResolvedValue({
      data: {
        preferencias: {
          'roomie.aseo_momento_semana': 'entre_semana',
          'roomie.aseo_horario': 'manana_6am_11am',
          'roomie.rasgos_negativos': ['impaciente', 'malhumorado'],
          'roomie.sueno_hora_dormir': '23:00',
        },
      },
    })

    vi.spyOn(apiModule, 'getCandidatosRoomies').mockResolvedValue({
      data: [
        {
          usuario_id: 101,
          nombre_completo: 'Valentina Muñoz',
          email: 'vmunoz@unicauca.edu.co',
          telefono_whatsapp: '3128904561',
          carrera: 'Ingeniería de Sistemas',
          bio: 'Estudiante de 6to semestre. Responsable y tranquila.',
          score: 94,
          detalle: { aseo: 1.0, sueno: 0.95, invitados: 1.0, pagos: 1.0, caracter: 0.85 },
          preferencias: {
            'roomie.aseo_momento_semana': 'entre_semana',
            'roomie.aseo_horario': 'manana_6am_11am',
          },
        },
        {
          usuario_id: 102,
          nombre_completo: 'Carlos Rivera',
          email: 'crivera@unicauca.edu.co',
          telefono_whatsapp: '3147890123',
          carrera: 'Medicina',
          bio: 'Estudiante ordenado y silencioso.',
          score: 65,
          detalle: { aseo: 0.8, sueno: 0.7, invitados: 0.6, pagos: 0.8, caracter: 0.7 },
          preferencias: {
            'roomie.aseo_momento_semana': 'fin_de_semana',
          },
        },
      ],
    })
  })

  it('renderiza el título principal y las tarjetas de candidatos', async () => {
    render(
      <BrowserRouter>
        <Roomies />
      </BrowserRouter>,
    )

    expect(screen.getByText(/Compañeros de Habitación \(Roomies\)/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Valentina Muñoz')).toBeInTheDocument()
      expect(screen.getByText('Carlos Rivera')).toBeInTheDocument()
    })

    expect(screen.getByText('94%')).toBeInTheDocument()
    expect(screen.getByText('Alta afinidad')).toBeInTheDocument()
  })

  it('permite filtrar por banda de afinidad', async () => {
    render(
      <BrowserRouter>
        <Roomies />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Valentina Muñoz')).toBeInTheDocument()
      expect(screen.getByText('Carlos Rivera')).toBeInTheDocument()
    })

    // Filtra solo alta afinidad (>=80%)
    const btnAlta = screen.getByRole('button', { name: /Alta afinidad/i })
    fireEvent.click(btnAlta)

    expect(screen.getByText('Valentina Muñoz')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Rivera')).not.toBeInTheDocument()

    // Filtra afinidad media (50-79%)
    const btnMedia = screen.getByRole('button', { name: /Afinidad media/i })
    fireEvent.click(btnMedia)

    expect(screen.queryByText('Valentina Muñoz')).not.toBeInTheDocument()
    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument()
  })

  it('abre el modal de desglose de convivencia al hacer clic en "Ver hábitos completos"', async () => {
    render(
      <BrowserRouter>
        <Roomies />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Valentina Muñoz')).toBeInTheDocument()
    })

    const btnsDetalle = screen.getAllByRole('button', { name: /Ver hábitos completos/i })
    fireEvent.click(btnsDetalle[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Detalle de Convivencia/i)).toBeInTheDocument()
    expect(screen.getByText(/Higiene y Cocina/i)).toBeInTheDocument()

    // Cerrar modal
    const btnCerrar = screen.getByRole('button', { name: /Cerrar modal/i })
    fireEvent.click(btnCerrar)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra botón para contactar por WhatsApp con enlace preformateado', async () => {
    render(
      <BrowserRouter>
        <Roomies />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Valentina Muñoz')).toBeInTheDocument()
    })

    const linksWhatsApp = screen.getAllByRole('link', { name: /Contactar WhatsApp/i })
    expect(linksWhatsApp[0]).toHaveAttribute('href', expect.stringContaining('https://wa.me/573128904561'))
  })
})
