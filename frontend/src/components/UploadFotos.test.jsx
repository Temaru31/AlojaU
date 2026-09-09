import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import UploadFotos from './UploadFotos'
import { api } from '../services/api'

vi.mock('../services/api', () => ({ api: { post: vi.fn() } }))

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  // jsdom no tiene createObjectURL/revokeObjectURL: mock mínimo.
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
  else vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  if (!URL.createObjectURL.mock) URL.createObjectURL = vi.fn(() => 'blob:mock')
})

const img = (name, size = 1000, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type })

const pickFiles = (input, files) => {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

describe('F3 UploadFotos', () => {
  it('renderiza dropzone + contador 0/10 y no muestra banner falso con initialUrls', () => {
    render(<UploadFotos token="t" onUrls={vi.fn()} initialUrls={['https://x/1.jpg']} />)
    expect(screen.getByRole('button', { name: 'Seleccionar fotos' })).toBeInTheDocument()
    expect(screen.getByText(/0\/10 fotos/)).toBeInTheDocument()
    // BUG-F3-02: antes mostraba "✓ Subidas 1 URLs" sin subir. Ahora no.
    expect(screen.queryByText(/Subidas .* URLs listas/)).not.toBeInTheDocument()
  })

  it('exige mínimo 3 fotos antes de subir (HU-005 C2)', async () => {
    render(<UploadFotos token="t" onUrls={vi.fn()} />)
    const input = document.querySelector('input[type="file"]')
    pickFiles(input, [img('a.png'), img('b.png')])
    // Con 2/10 el botón está deshabilitado (defensa) y el dropzone indica faltante.
    expect(await screen.findByText(/faltan 1 para mínimo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subir 2 fotos/ })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rechaza no-imagen y >5MB sin llamar al backend', async () => {
    render(<UploadFotos token="t" onUrls={vi.fn()} />)
    const input = document.querySelector('input[type="file"]')
    pickFiles(input, [new File(['x'], 'doc.txt', { type: 'text/plain' })])
    expect(await screen.findByText(/no es imagen/)).toBeInTheDocument()
    pickFiles(input, [img('big.png', 6 * 1024 * 1024)])
    expect(await screen.findByText(/excede 5MB/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sube 3 fotos y propaga secure_url Cloudinary + banner verde', async () => {
    const onUrls = vi.fn()
    const cloud = [
      'https://res.cloudinary.com/demo/image/upload/alojau/a1.png',
      'https://res.cloudinary.com/demo/image/upload/alojau/a2.png',
      'https://res.cloudinary.com/demo/image/upload/alojau/a3.png',
    ]
    api.post.mockResolvedValue({ data: { urls: cloud, count: 3 } })
    render(<UploadFotos token="tok-arr" onUrls={onUrls} />)
    const input = document.querySelector('input[type="file"]')
    pickFiles(input, [img('a1.png'), img('a2.png'), img('a3.png')])
    fireEvent.click(screen.getByRole('button', { name: /Subir 3 fotos/ }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/publicaciones/upload',
        expect.any(FormData),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok-arr' }) }),
      ),
    )
    expect(onUrls).toHaveBeenCalledWith(cloud)
    expect(await screen.findByText(/Subidas 3 URLs listas/)).toBeInTheDocument()
  })

  it('Limpiar revoca previews y propaga onUrls([]) (BUG-F3-03)', async () => {
    const onUrls = vi.fn()
    render(<UploadFotos token="t" onUrls={onUrls} />)
    const input = document.querySelector('input[type="file"]')
    pickFiles(input, [img('a.png'), img('b.png'), img('c.png')])
    expect(await screen.findByText(/3\/10 fotos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onUrls).toHaveBeenCalledWith([])
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(screen.getByText(/0\/10 fotos/)).toBeInTheDocument()
  })

  it('quitar una foto revoca solo esa (sin leak BUG-F3-01)', async () => {
    render(<UploadFotos token="t" onUrls={vi.fn()} />)
    const input = document.querySelector('input[type="file"]')
    pickFiles(input, [img('a.png'), img('b.png'), img('c.png')])
    const btns = await screen.findAllByRole('button', { name: /Quitar / })
    expect(btns).toHaveLength(3)
    vi.clearAllMocks()
    fireEvent.click(btns[0])
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/2\/10 fotos/)).toBeInTheDocument()
  })
})
