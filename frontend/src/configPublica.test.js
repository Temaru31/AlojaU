// Detalle #3: config pública con caché + fallback a LIMITES.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  LIMITES,
  estaDesactualizada,
  fetchConfigPublica,
  diasDesactualizadaEfectiva,
  limpiarConfigCache,
  leerConfigCache,
} from './constants'

beforeEach(() => {
  limpiarConfigCache()
  localStorage.clear()
})

describe('config pública (detalle #3)', () => {
  it('usa LIMITES cuando no hay caché', () => {
    expect(diasDesactualizadaEfectiva()).toBe(LIMITES.desactualizadaDias)
    const vieja = new Date(Date.now() - 40 * 86_400_000).toISOString()
    expect(estaDesactualizada(vieja)).toBe(true)
  })

  it('cachea el valor del backend y lo aplica', async () => {
    const cfg = await fetchConfigPublica(async () => ({ dias_desactualizada: 7 }))
    expect(cfg.dias_desactualizada).toBe(7)
    expect(diasDesactualizadaEfectiva()).toBe(7)
    const media = new Date(Date.now() - 10 * 86_400_000).toISOString()
    expect(estaDesactualizada(media, diasDesactualizadaEfectiva())).toBe(true)
    expect(leerConfigCache().dias_desactualizada).toBe(7)
  })

  it('falla en silencio con fallback local', async () => {
    const cfg = await fetchConfigPublica(async () => {
      throw new Error('red caída')
    })
    expect(cfg).toBeNull()
    expect(diasDesactualizadaEfectiva()).toBe(LIMITES.desactualizadaDias)
  })

  it('rechaza valores fuera de rango', async () => {
    await fetchConfigPublica(async () => ({ dias_desactualizada: 9999 }))
    expect(diasDesactualizadaEfectiva()).toBe(LIMITES.desactualizadaDias)
  })
})
