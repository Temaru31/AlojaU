// M2: sesiones legibles (fecha 12h + dispositivo).
import { describe, it, expect } from 'vitest'
import { formatearSesionFecha, etiquetaDispositivo } from './sesion'

describe('formatearSesionFecha', () => {
  it('convierte ISO a 12h con AM/PM (hora Bogotá, determinista en cualquier TZ)', () => {
    // 22:14 en Bogotá (-05:00), sin importar la zona del entorno de test.
    expect(formatearSesionFecha('2026-09-23T22:14:00-05:00')).toBe('23 Sep 2026, 10:14 PM')
  })

  it('medianoche es 12 AM y mediodía 12 PM', () => {
    expect(formatearSesionFecha('2026-01-05T00:05:00-05:00')).toBe('5 Ene 2026, 12:05 AM')
    expect(formatearSesionFecha('2026-01-05T12:00:00-05:00')).toBe('5 Ene 2026, 12:00 PM')
  })

  it('null o inválido retorna null', () => {
    expect(formatearSesionFecha(null)).toBeNull()
    expect(formatearSesionFecha('no-fecha')).toBeNull()
  })
})

describe('etiquetaDispositivo', () => {
  it('parsea combinaciones comunes', () => {
    expect(etiquetaDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36'))
      .toBe('Chrome en Windows')
    expect(etiquetaDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari/604.1'))
      .toBe('Safari en iPhone')
    expect(etiquetaDispositivo('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'))
      .toBe('Firefox en Linux')
  })

  it('iOS (CriOS/FxiOS/EdgiOS) y fallbacks seguros', () => {
    expect(etiquetaDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/120.0 Safari/604.1'))
      .toBe('Chrome en iPhone')
    expect(etiquetaDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) FxiOS/120.0 Safari/604.1'))
      .toBe('Firefox en iPhone')
    expect(etiquetaDispositivo('Mock')).toBe('Este dispositivo (demo)')
    expect(etiquetaDispositivo(null)).toBe('Dispositivo desconocido')
    expect(etiquetaDispositivo('')).toBe('Dispositivo desconocido')
    expect(etiquetaDispositivo('curl/8.0')).toBe('Dispositivo desconocido')
  })
})
