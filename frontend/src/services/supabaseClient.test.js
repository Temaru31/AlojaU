import { describe, it, expect } from 'vitest'
import { parseAuthCallbackHash } from './supabaseClient'

describe('parseAuthCallbackHash (anti prototype-pollution)', () => {
  it('extrae tokens del fragmento OAuth', () => {
    const out = parseAuthCallbackHash('#access_token=abc123&token_type=bearer&expires_in=3600')
    expect(out).toMatchObject({ access_token: 'abc123', token_type: 'bearer', expires_in: '3600' })
  })

  it('ignora claves que contaminarían Object.prototype', () => {
    const out = parseAuthCallbackHash('#access_token=x&__proto__[polluted]=1&constructor[x]=1&prototype[y]=1')
    expect(out.access_token).toBe('x')
    expect(out.polluted).toBeUndefined()
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.polluted).toBeUndefined()
  })

  it('hash vacío o inválido retorna objeto vacío', () => {
    expect(parseAuthCallbackHash('')).toEqual({})
    expect(parseAuthCallbackHash(null)).toEqual({})
  })
})
