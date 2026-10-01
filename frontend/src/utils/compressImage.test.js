import { describe, it, expect, vi, afterEach } from 'vitest'
import { comprimirImagen, COMPRESS_MAX_WIDTH } from './compressImage'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const img = (name = 'foto.png', size = 1000, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type })

describe('comprimirImagen', () => {
  it('retorna no-imágenes intactas', async () => {
    const f = new File(['x'], 'doc.txt', { type: 'text/plain' })
    await expect(comprimirImagen(f)).resolves.toBe(f)
  })

  it('sin createImageBitmap (jsdom) retorna la original', async () => {
    const f = img('a.png', 2 * 1024 * 1024)
    await expect(comprimirImagen(f)).resolves.toBe(f)
  })

  it('foto pequeña (<=1200px y liviana) se conserva', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })))
    const f = img('peq.png', 1000)
    await expect(comprimirImagen(f)).resolves.toBe(f)
  })

  it('foto grande se reduce a máx 1200px en WEBP', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2400, height: 1600, close: vi.fn() })))
    const drawImage = vi.fn()
    const toBlob = vi.fn((cb) => cb(new Blob([new Uint8Array(50000)], { type: 'image/webp' })))
    const crearReal = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, opts) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob }
      return crearReal(tag, opts)
    })
    const f = img('grande.png', 2 * 1024 * 1024)
    const out = await comprimirImagen(f)
    expect(out).not.toBe(f)
    expect(out.name).toBe('grande.webp')
    expect(out.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalled()
  })

  it('si WEBP no soportado cae a JPEG', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2400, height: 1600, close: vi.fn() })))
    const toBlob = vi.fn((cb, tipo) => cb(tipo === 'image/jpeg' ? new Blob([new Uint8Array(60000)]) : null))
    const crearReal = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, opts) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob }
      return crearReal(tag, opts)
    })
    const out = await comprimirImagen(img('g.png', 2 * 1024 * 1024))
    expect(out.name).toBe('g.jpg')
    expect(COMPRESS_MAX_WIDTH).toBe(1200)
  })
})
