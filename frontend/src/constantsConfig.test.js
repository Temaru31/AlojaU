import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  leerConfigCache, fetchConfigPublica, diasDesactualizadaEfectiva, limpiarConfigCache,
} from './constants'

afterEach(() => { localStorage.clear(); limpiarConfigCache(); vi.restoreAllMocks() })

describe('constants config pública (caché 5min, honest branches)', () => {
  it('sin nada retorna null', () => {
    expect(leerConfigCache()).toBeNull()
  })

  it('memoria fresca se devuelve sin tocar localStorage', () => {
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 12, tipos_vivienda: [] }, ts: Date.now(),
    }))
    const primera = leerConfigCache()
    expect(primera.dias_desactualizada).toBe(12)
    // Segunda lectura viene de memoria (misma referencia).
    expect(leerConfigCache()).toBe(primera)
  })

  it('caché expirada retorna null', () => {
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 12 }, ts: Date.now() - 6 * 60_000,
    }))
    expect(leerConfigCache()).toBeNull()
  })

  it('JSON corrupto retorna null sin lanzar', () => {
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', 'no-json{{{')
    expect(leerConfigCache()).toBeNull()
  })

  it('fetchConfigPublica usa caché si hay hit (no llama getter)', async () => {
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 9 }, ts: Date.now(),
    }))
    const getter = vi.fn()
    const cfg = await fetchConfigPublica(getter)
    expect(cfg.dias_desactualizada).toBe(9)
    expect(getter).not.toHaveBeenCalled()
  })

  it('fetchConfigPublica guarda en memoria+localStorage al éxito', async () => {
    const getter = vi.fn().mockResolvedValue({ dias_desactualizada: 21 })
    const cfg = await fetchConfigPublica(getter)
    expect(cfg.dias_desactualizada).toBe(21)
    expect(JSON.parse(localStorage.getItem('alojau_config_publica')).cfg.dias_desactualizada).toBe(21)
  })

  it('getter que retorna no-objeto cae a null sin romper', async () => {
    expect(await fetchConfigPublica(() => Promise.resolve(null))).toBeNull()
    expect(await fetchConfigPublica(() => Promise.resolve(42))).toBeNull()
  })

  it('getter que rechaza cae a null sin lanzar', async () => {
    await expect(fetchConfigPublica(() => Promise.reject(new Error('red')))).resolves.toBeNull()
  })

  it('diasDesactualizadaEfectiva: válido, inválido, fuera de rango', () => {
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 45 }, ts: Date.now(),
    }))
    expect(diasDesactualizadaEfectiva()).toBe(45)
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 'no-num' }, ts: Date.now(),
    }))
    expect(diasDesactualizadaEfectiva()).toBe(30)
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 9999 }, ts: Date.now(),
    }))
    expect(diasDesactualizadaEfectiva()).toBe(30)
    limpiarConfigCache()
    localStorage.setItem('alojau_config_publica', JSON.stringify({
      cfg: { dias_desactualizada: 0 }, ts: Date.now(),
    }))
    expect(diasDesactualizadaEfectiva()).toBe(30)
  })

  it('limpiarConfigCache deja null aunque haya localStorage', () => {
    localStorage.setItem('alojau_config_publica', JSON.stringify({ cfg: { a: 1 }, ts: Date.now() }))
    leerConfigCache()
    limpiarConfigCache()
    localStorage.removeItem('alojau_config_publica')
    expect(leerConfigCache()).toBeNull()
  })
})
