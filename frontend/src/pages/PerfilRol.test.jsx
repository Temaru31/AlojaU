// Perfil v13.2: badge de rol reactivo + checklist progresiva + tags permitidos.
import { describe, it, expect } from 'vitest'
import { ROL_LABEL, TAGS_DISPONIBLES, checklistPerfil } from './Perfil'

describe('ROL_LABEL (ciclo de vida visible)', () => {
  it('mapea roles técnicos a etiquetas humanas', () => {
    expect(ROL_LABEL.ESTUDIANTE).toBe('Usuario Base')
    expect(ROL_LABEL.ARRENDADOR).toBe('Arrendador Activo')
    expect(ROL_LABEL.ADMIN).toBe('Administrador')
  })
})

describe('checklistPerfil (progressive profiling)', () => {
  it('perfil vacío de Google: solo nombre, 1/6', () => {
    const check = checklistPerfil({
      nombre_completo: 'Ana', email_verificado: true,
      telefono_whatsapp: null, bio: null, foto_perfil_url: null, preferencias: {},
    })
    expect(check.items).toHaveLength(6)
    expect(check.items.find(i => i.id === 'telefono').ok).toBe(false)
    expect(check.pct).toBeLessThan(100)
  })

  it('perfil completo: 100%', () => {
    const check = checklistPerfil({
      nombre_completo: 'Ana Ríos', email_verificado: true,
      telefono_whatsapp: '573001234567', bio: 'Hola', foto_perfil_url: 'https://x/y.jpg',
      preferencias: { 'roomie.buscando': true },
    })
    expect(check.pct).toBe(100)
  })

  it('tolera perfil nulo (cargando)', () => {
    const check = checklistPerfil(null)
    expect(check.pct).toBe(0)
  })
})

describe('TAGS_DISPONIBLES (contrato con backend)', () => {
  it('todas las claves usan namespaces permitidos (filtros/roomie/notis)', () => {
    const validos = ['filtros.', 'roomie.', 'notis.']
    for (const t of TAGS_DISPONIBLES) {
      expect(validos.some(p => t.key.startsWith(p))).toBe(true)
    }
  })
})
