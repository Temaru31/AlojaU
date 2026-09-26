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

describe('checklistPerfil (M3 pesos 20+20+20+15+15+10=100)', () => {
  it('perfil vacío de Google: solo email (20%)', () => {
    const check = checklistPerfil({
      nombre_completo: 'Ana', email_verificado: true,
      telefono_whatsapp: null, bio: null, foto_perfil_url: null, preferencias: {},
      rol: 'ESTUDIANTE',
    }, { tieneAviso: false })
    expect(check.items).toHaveLength(6)
    expect(check.items.find(i => i.id === 'telefono').ok).toBe(false)
    expect(check.pct).toBe(20)
  })

  it('pesos exactos por ítem', () => {
    const base = {
      nombre_completo: 'Ana Ríos', email_verificado: false,
      telefono_whatsapp: null, bio: '', foto_perfil_url: null, preferencias: {},
      rol: 'ESTUDIANTE',
    }
    expect(checklistPerfil({ ...base, email_verificado: true }, {}).pct).toBe(20)
    expect(checklistPerfil({ ...base, telefono_whatsapp: '573001234567' }, {}).pct).toBe(20)
    expect(checklistPerfil({ ...base, foto_perfil_url: 'https://x/y.jpg' }, {}).pct).toBe(20)
    expect(checklistPerfil({ ...base, bio: 'Hola' }, {}).pct).toBe(15)
    expect(checklistPerfil({ ...base, preferencias: { 'filtros.mascotas': true } }, {}).pct).toBe(15)
    expect(checklistPerfil({ ...base }, { tieneAviso: true }).pct).toBe(10)
    expect(checklistPerfil({ ...base, rol: 'ARRENDADOR' }, {}).pct).toBe(10)
  })

  it('perfil completo: 100%', () => {
    const check = checklistPerfil({
      nombre_completo: 'Ana Ríos', email_verificado: true,
      telefono_whatsapp: '573001234567', bio: 'Hola', foto_perfil_url: 'https://x/y.jpg',
      preferencias: { 'filtros.mascotas': true }, rol: 'ARRENDADOR',
    }, { tieneAviso: true })
    expect(check.pct).toBe(100)
  })

  it('tolera perfil nulo (cargando)', () => {
    const check = checklistPerfil(null)
    expect(check.pct).toBe(0)
  })
})

describe('TAGS_DISPONIBLES (M3 solo filtros.*, Ley 1581)', () => {
  it('todas las claves usan ÚNICAMENTE filtros.* (sin Estudiante ni demográficos)', () => {
    expect(TAGS_DISPONIBLES.length).toBeGreaterThan(0)
    for (const t of TAGS_DISPONIBLES) {
      expect(t.key.startsWith('filtros.')).toBe(true)
    }
    const keys = TAGS_DISPONIBLES.map((t) => t.key)
    expect(keys).not.toContain('estudiante')
    expect(JSON.stringify(keys).toLowerCase()).not.toMatch(/nacimiento|genero|género/)
  })

  it('F1 matriz de 8 dimensiones con icono y sin emojis en etiqueta', () => {
    expect(TAGS_DISPONIBLES).toHaveLength(8)
    for (const t of TAGS_DISPONIBLES) {
      expect(t.icono).toBeTruthy()
      expect(t.label).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    }
    expect(TAGS_DISPONIBLES.map((t) => t.key)).toEqual([
      'filtros.mascotas', 'filtros.tranquilo', 'filtros.no_fumador',
      'filtros.misma_facultad', 'filtros.cocina_equipada', 'filtros.lavadora',
      'filtros.sin_horario', 'filtros.parqueadero',
    ])
  })
})
