// Supabase Auth wrapper (v13.1) — Google OAuth con SDK + fallback sin deps.
//
// - Configurado (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY):
//   usa @supabase/supabase-js (lazy, chunk separado): signInWithOAuth
//   gestiona PKCE solo; el callback acepta `?code=` (exchangeCodeForSession)
//   y `#access_token=` (implicit). La UI nunca muestra "No se recibió token"
//   por el tipo de flujo del Dashboard.
// - Sin SDK o sin config: redirect estándar a /auth/v1/authorize (implícito)
//   o error OAUTH_NOT_CONFIGURED con guía (protocolo human-in-the-loop).
//
// Uso:
//   await signInWithGoogle()
//   const session = await exchangeCodeForSession(code)
//   const sb = await getSupabaseClient()

const DEV_REDIRECT = 'http://localhost:5173/auth/callback'
const PROD_REDIRECT = 'https://aloja-u.vercel.app/auth/callback'

export function getSupabaseConfig(env = import.meta.env) {
  const url = (env?.VITE_SUPABASE_URL || '').trim()
  const anonKey = (env?.VITE_SUPABASE_ANON_KEY || '').trim()
  return { url, anonKey, configured: Boolean(url && anonKey) }
}

export function getOAuthRedirect(env = import.meta.env) {
  // En build de prod se usa el dominio canónico; en dev, localhost.
  if (env?.PROD) return PROD_REDIRECT
  return DEV_REDIRECT
}

export function buildGoogleAuthUrl(supabaseUrl, redirectTo) {
  const base = String(supabaseUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams({ provider: 'google', redirect_to: redirectTo })
  return `${base}/auth/v1/authorize?${params.toString()}`
}

// Extrae tokens del fragmento (#access_token=...) que Supabase devuelve.
export function parseAuthCallbackHash(hash = window.location.hash) {
  const out = {}
  try {
    const h = String(hash || '').replace(/^#/, '')
    for (const [k, v] of new URLSearchParams(h)) out[k] = v
  } catch { /* noop */ }
  return out
}

export function getCallbackCode(search = window.location.search) {
  try {
    return new URLSearchParams(search || '').get('code') || ''
  } catch {
    return ''
  }
}

let _sdkClient = null

export function __resetSupabaseClientForTests() {
  _sdkClient = null
}

export async function getSupabaseClient(env = import.meta.env) {
  const { url, anonKey, configured } = getSupabaseConfig(env)
  if (!configured) {
    const err = new Error(
      'Google OAuth no configurado: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. ' +
      'Guía en docs/AUTH_ENTERPRISE.md',
    )
    err.code = 'OAUTH_NOT_CONFIGURED'
    throw err
  }
  // Cliente inyectado (tests / host con SDK global).
  try {
    if (typeof window !== 'undefined' && window.supabase?.auth?.signInWithOAuth) {
      return window.supabase
    }
  } catch { /* noop */ }
  if (!_sdkClient) {
    const { createClient } = await import('@supabase/supabase-js')
    _sdkClient = createClient(url, anonKey)
  }
  return _sdkClient
}

// M5: destino post-login (ej. "/publicar"). Se guarda en sessionStorage
// (no en la URL de redirect: Supabase solo acepta URLs registradas).
export const POST_LOGIN_REDIRECT_KEY = 'alojau_post_login_redirect'

export function guardarRedirectPostLogin(destino) {
  try {
    if (typeof destino === 'string' && destino.startsWith('/') && !destino.startsWith('//')) {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, destino)
    }
  } catch { /* noop */ }
}

export function leerRedirectPostLogin() {
  try {
    const v = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) || '/'
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    return v.startsWith('/') && !v.startsWith('//') ? v : '/'
  } catch {
    return '/'
  }
}

export async function signInWithGoogle(env = import.meta.env) {
  const redirectTo = getOAuthRedirect(env)
  let sb = null
  try {
    sb = await getSupabaseClient(env)
  } catch (e) {
    throw e // OAUTH_NOT_CONFIGURED con guía (no botón muerto)
  }
  try {
    // El SDK gestiona PKCE (code_challenge + verifier en storage) o
    // implícito según el proyecto; ambas respuestas las entiende el callback.
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) throw error
    return { via: 'sdk' }
  } catch {
    // Sin SDK operativo: redirect estándar (flujo implícito, cero deps).
    const { url } = getSupabaseConfig(env)
    window.location.href = buildGoogleAuthUrl(url, redirectTo)
    return { via: 'redirect' }
  }
}

// v13.1: intercambia ?code= (PKCE) por sesión. Requiere que el login lo haya
// iniciado el SDK (guarda el code_verifier); si no hay verifier, el SDK lanza
// error descriptivo (nunca "No se recibió token" genérico en la UI).
export async function exchangeCodeForSession(code, env = import.meta.env) {
  if (!code) {
    const err = new Error('Falta el código de autorización de Google.')
    err.code = 'OAUTH_MISSING_CODE'
    throw err
  }
  const sb = await getSupabaseClient(env)
  const { data, error } = await sb.auth.exchangeCodeForSession(code)
  if (error) throw error
  return data.session
}
