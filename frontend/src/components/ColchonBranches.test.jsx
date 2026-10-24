import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { parseServicios, toggleServicio, contarAvanzados } from './Filtros'
import { nombreTipo } from '../hooks/useTiposVivienda'
import BreadcrumbsAdmin from './BreadcrumbsAdmin'
import TelegramVincular from './TelegramVincular'
import { api } from '../services/api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('colchón branches honesto (helpers + bordes UI)', () => {
  it('parseServicios: null, vacío, espacios y comas', () => {
    expect(parseServicios(null)).toEqual([])
    expect(parseServicios('')).toEqual([])
    expect(parseServicios(' 1 , , 2 ')).toEqual(['1', '2'])
  })

  it('toggleServicio: agrega, quita y vacía a undefined', () => {
    expect(toggleServicio('', 1, true)).toBe('1')
    expect(toggleServicio('1,2', 1, false)).toBe('2')
    expect(toggleServicio('1', 1, false)).toBeUndefined()
    expect(toggleServicio('2,1', 3, true)).toBe('1,2,3')
  })

  it('contarAvanzados: undefined y parcial', () => {
    expect(contarAvanzados()).toBe(0)
    expect(contarAvanzados({ min: '', max: '', tipo: '', servicios: '' })).toBe(0)
    expect(contarAvanzados({ max: '5' })).toBe(1)
  })

  it('nombreTipo: tipos null y fallback null', () => {
    expect(nombreTipo(null, 'APARTAESTUDIO')).toBe('Apartaestudio')
    expect(nombreTipo([], null, 'Libre')).toBe('Libre')
    expect(nombreTipo([], undefined)).toBe('No informado')
  })

  it('BreadcrumbsAdmin sin actual solo muestra Inicio+Panel', () => {
    render(<BrowserRouter><BreadcrumbsAdmin /></BrowserRouter>)
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Panel Admin')).toBeInTheDocument()
  })

  it('TelegramVincular error de red muestra alerta honesta y Reintentar', async () => {
    const getSpy = vi.spyOn(api, 'get').mockRejectedValue({ response: { data: { detail: 'Sin bot' } } })
    render(<TelegramVincular token="t" vinculado={false} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sin bot'))
    expect(screen.queryByRole('link', { name: /Abrir Bot en Telegram/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reintentar enlace/ }))
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2))
  })

  it('TelegramVincular sin bot_url válida muestra error sin enlace', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { bot_url: 'http://mal' } })
    const hrefAntes = window.location.href
    render(<TelegramVincular token="t" vinculado={false} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Respuesta inválida del bot/))
    expect(screen.queryByRole('link', { name: /Abrir Bot en Telegram/ })).not.toBeInTheDocument()
    expect(window.location.href).toBe(hrefAntes)
  })
})
