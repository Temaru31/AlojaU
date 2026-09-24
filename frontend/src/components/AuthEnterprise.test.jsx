// GoogleButton + supabaseClient + PasswordStrength + ColdStartBanner (v13).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import GoogleButton from '../components/GoogleButton'
import PasswordStrength, { criteriosPassword, passwordValidaV13 } from '../components/PasswordStrength'
import ColdStartBanner, { COLD_START_MESSAGE } from '../components/ColdStartBanner'
import {
  getSupabaseConfig,
  getOAuthRedirect,
  buildGoogleAuthUrl,
  signInWithGoogle,
  getCallbackCode,
  exchangeCodeForSession,
  guardarRedirectPostLogin,
  leerRedirectPostLogin,
  POST_LOGIN_REDIRECT_KEY,
  __resetSupabaseClientForTests,
} from '../services/supabaseClient'

afterEach(() => {
  cleanup()
  __resetSupabaseClientForTests()
  try { delete window.supabase } catch { /* noop */ }
})

describe('GoogleButton (guía de marca)', () => {
  it('muestra el logo G vectorial y el texto de login', () => {
    render(<GoogleButton />)
    const btn = screen.getByRole('button', { name: /continuar con google/i })
    expect(btn).toBeInTheDocument()
    expect(btn.querySelector('svg')).not.toBeNull()
  })

  it('modo registro cambia el texto y respeta loading', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<GoogleButton mode="register" onClick={onClick} />)
    expect(screen.getByRole('button', { name: /registrarse con google/i })).toBeInTheDocument()
    rerender(<GoogleButton mode="register" loading onClick={onClick} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toMatch(/conectando/i)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('es accesible: botón nativo con aria-label', () => {
    render(<GoogleButton />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/google/i)
  })

  it('tema claro por defecto (guía de marca, ignora dark-mode del SO)', () => {
    render(<GoogleButton />)
    expect(screen.getByRole('button').className).toMatch('google-btn--light')
  })
})

describe('supabaseClient (OAuth resiliente)', () => {
  it('sin env -> configured false y error útil con guía', async () => {
    expect(getSupabaseConfig({}).configured).toBe(false)
    await expect(signInWithGoogle({})).rejects.toMatchObject({ code: 'OAUTH_NOT_CONFIGURED' })
  })

  it('construye la authorization URL estándar de Supabase', () => {
    const url = buildGoogleAuthUrl('https://xxx.supabase.co', 'http://localhost:5173/auth/callback')
    expect(url).toContain('/auth/v1/authorize?')
    expect(url).toContain('provider=google')
    expect(url).toContain('redirect_to=')
  })

  it('redirect prod usa el dominio canónico con guion', () => {
    expect(getOAuthRedirect({ PROD: true })).toBe('https://aloja-u.vercel.app/auth/callback')
    expect(getOAuthRedirect({})).toBe('http://localhost:5173/auth/callback')
  })

  it('SDK ok retorna via sdk sin tocar location', async () => {
    window.supabase = { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }) } }
    const env = { VITE_SUPABASE_URL: 'https://xxx.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
    const r = await signInWithGoogle(env)
    expect(r).toEqual({ via: 'sdk' })
    expect(window.supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:5173/auth/callback' },
    })
  })

  it('SDK con error devuelve redirect estándar a la URL canónica', async () => {
    let href = ''
    Object.defineProperty(window, 'location', {
      value: {}, writable: true, configurable: true,
    })
    Object.defineProperty(window.location, 'href', { set: (v) => { href = v }, configurable: true })
    window.supabase = { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: new Error('popup') }) } }
    const env = { VITE_SUPABASE_URL: 'https://xxx.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
    const r = await signInWithGoogle(env)
    expect(r.via).toBe('redirect')
    expect(href).toContain('https://xxx.supabase.co/auth/v1/authorize')
    expect(href).toContain('provider=google')
  })

  it('redirect post-login valida y rechaza open-redirect', () => {
    guardarRedirectPostLogin('/publicar')
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBe('/publicar')
    expect(leerRedirectPostLogin()).toBe('/publicar')
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull()
    guardarRedirectPostLogin('https://evil.com/x')
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull()
    guardarRedirectPostLogin('//evil.com/x')
    expect(leerRedirectPostLogin()).toBe('/')
    expect(leerRedirectPostLogin()).toBe('/')
  })

  it('SDK que lanza excepción también cae al redirect', async () => {
    Object.defineProperty(window, 'location', {
      value: {}, writable: true, configurable: true,
    })
    let href = ''
    Object.defineProperty(window.location, 'href', { set: (v) => { href = v }, configurable: true })
    window.supabase = { auth: { signInWithOAuth: () => { throw new Error('boom') } } }
    const env = { VITE_SUPABASE_URL: 'https://xxx.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
    const r = await signInWithGoogle(env)
    expect(r.via).toBe('redirect')
    expect(href).toContain('/auth/v1/authorize')
  })
})

describe('supabaseClient v13.1 (dual PKCE/implicit)', () => {
  it('getCallbackCode lee ?code= y vacío si no hay', () => {
    expect(getCallbackCode('?code=abc123&state=x')).toBe('abc123')
    expect(getCallbackCode('')).toBe('')
    expect(getCallbackCode('?error=access_denied')).toBe('')
  })

  it('exchangeCodeForSession sin código lanza OAUTH_MISSING_CODE', async () => {
    await expect(exchangeCodeForSession('')).rejects.toMatchObject({ code: 'OAUTH_MISSING_CODE' })
  })

  it('exchangeCodeForSession usa el cliente inyectado (PKCE)', async () => {
    const fakeSession = {
      access_token: 'sb-access',
      user: { id: 'sup-1', email: 'a@b.co', user_metadata: { full_name: 'Ana' } },
    }
    window.supabase = {
      auth: {
        signInWithOAuth: vi.fn(),
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
      },
    }
    const env = { VITE_SUPABASE_URL: 'https://xxx.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
    const session = await exchangeCodeForSession('codigo-pkce', env)
    expect(session).toEqual(fakeSession)
    expect(window.supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('codigo-pkce')
  })

  it('exchangeCodeForSession propaga el error del SDK (nunca genérico)', async () => {
    window.supabase = {
      auth: {
        signInWithOAuth: vi.fn(),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: null }, error: new Error('invalid code verifier'),
        }),
      },
    }
    const env = { VITE_SUPABASE_URL: 'https://xxx.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
    await expect(exchangeCodeForSession('mal', env)).rejects.toThrow(/code verifier/)
  })
})

describe('PasswordStrength (v13)', () => {
  it('exige 8 + mayús + número + especial', () => {
    expect(passwordValidaV13('Segura1!x')).toBe(true)
    expect(passwordValidaV13('corta1!')).toBe(false)
    expect(passwordValidaV13('sinmayus1!')).toBe(false)
    expect(passwordValidaV13('SinNumero!x')).toBe(false)
    expect(passwordValidaV13('SinEspecial1x')).toBe(false)
    expect(criteriosPassword('Segura1!x')).toEqual({
      longitud: true, mayuscula: true, numero: true, especial: true,
    })
  })

  it('muestra los 4 criterios en vivo', () => {
    render(<PasswordStrength value="abc" />)
    expect(screen.getByText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(screen.getByText(/mayúscula/i)).toBeInTheDocument()
  })
})

describe('ColdStartBanner (Render free tier)', () => {
  it('oculto por defecto y muestra el mensaje requerido ante lentitud', async () => {
    render(<ColdStartBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    window.dispatchEvent(new Event('alojau:api-slow-start'))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain(COLD_START_MESSAGE)
    expect(COLD_START_MESSAGE).toContain('Iniciando servidores seguros de AlojaU')
    window.dispatchEvent(new Event('alojau:api-slow-end'))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
