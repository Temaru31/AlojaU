// AuthCallback.jsx — /auth/callback: retorno de Google (Supabase OAuth).
//
// Flujo dual v13.1 (la UI nunca muestra "No se recibió token" por el tipo
// de flujo configurado en Supabase Dashboard):
// 1a. PKCE: `?code=` -> exchangeCodeForSession(code) -> session.
// 1b. Implícito: `#access_token=` (JWT) directo del fragmento.
// 2. Se envía email+nombre+supabase_id al backend (/oauth/google/callback)
//    que hace identity linking (fusiona con cuenta manual si existe,
//    nunca duplica; revive cuentas en período de gracia) y devuelve el
//    JWT propio de AlojaU.
// 3. Se guarda el token y se redirige al inicio.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { parseAuthCallbackHash, getCallbackCode, exchangeCodeForSession, leerRedirectPostLogin } from '../services/supabaseClient'
import { emitAuthChange } from '../contexts/AuthContext'

function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState('procesando') // procesando|ok|error
  const [detalle, setDetalle] = useState('')
  const [esNuevo, setEsNuevo] = useState(false)

  // Bloque 3: el redirect diferido se cancela al desmontar (el flag `vivo`
  // ya protege los setState, pero el navigate huérfano también se evita).
  const navTimer = useRef(null)
  useEffect(() => () => window.clearTimeout(navTimer.current), [])

  useEffect(() => {
    let vivo = true
    const run = async () => {
      const params = new URLSearchParams(window.location.search || '')
      const frag = parseAuthCallbackHash()
      const err = frag.error_description || frag.error || params.get('error')
        || params.get('error_description')
      if (err) {
        if (vivo) { setEstado('error'); setDetalle(String(err)) }
        return
      }
      // v13.1 dual: PKCE (?code=) o implícito (#access_token=).
      let supabaseJwt = frag.access_token || ''
      let claims = supabaseJwt ? decodeJwtPayload(supabaseJwt) : {}
      const code = getCallbackCode()
      if (!supabaseJwt && code) {
        try {
          const session = await exchangeCodeForSession(code)
          supabaseJwt = session?.access_token || ''
          claims = session?.user
            ? { email: session.user.email, sub: session.user.id || session.user.sub,
                user_metadata: session.user.user_metadata || {} }
            : decodeJwtPayload(supabaseJwt)
        } catch (e) {
          if (vivo) {
            setEstado('error')
            setDetalle(e?.message || 'No se pudo completar el inicio con Google (PKCE). Intenta de nuevo.')
          }
          return
        }
      }
      if (!supabaseJwt) {
        if (vivo) {
          setEstado('error')
          setDetalle('Google no devolvió credenciales (sin token ni código). Revisa la configuración OAuth e intenta de nuevo.')
        }
        return
      }
      const email = claims.email || params.get('email') || ''
      const nombre =
        claims.user_metadata?.full_name ||
        claims.user_metadata?.name ||
        (email ? email.split('@')[0] : 'Usuario Google')
      const supabaseId = claims.sub || null
      const foto = claims.user_metadata?.avatar_url || claims.user_metadata?.picture || null
      if (!email) {
        if (vivo) {
          setEstado('error')
          setDetalle('Google no devolvió un correo verificable.')
        }
        return
      }
      try {
        const r = await api.post('/api/auth/oauth/google/callback', {
          email,
          nombre_completo: String(nombre).slice(0, 150),
          supabase_id: supabaseId,
          supabase_jwt: supabaseJwt,
          foto_perfil_url: foto,
        })
        try { localStorage.setItem('alojau_token', r.data.access_token) } catch { /* noop */ }
        emitAuthChange()
        if (vivo) {
          // Login y registro con Google son el mismo flujo (crea-o-vincula):
          // el backend dice si la cuenta nació ahora para el mensaje correcto.
          setEsNuevo(!!r.data?.es_nuevo)
          setEstado('ok')
          // M5: vuelve a donde estaba (ej. /publicar) o al inicio.
          const destino = leerRedirectPostLogin()
          navTimer.current = window.setTimeout(() => { if (vivo) navigate(destino) }, 900)
        }
      } catch (e) {
        if (vivo) {
          setEstado('error')
          setDetalle(e?.response?.data?.detail || 'No se pudo vincular tu cuenta de Google.')
        }
      }
    }
    run()
    return () => { vivo = false }
  }, [navigate])

  return (
    <div className="container-main py-12">
      <div className="max-w-md mx-auto card p-8 text-center space-y-4">
        {estado === 'procesando' && (
          <>
            <span aria-hidden="true" className="mx-auto w-8 h-8 rounded-full border-2 border-neutral-200 border-t-navy-800 animate-spin block" />
            <h1 className="text-lg font-bold text-navy-900">Vinculando tu cuenta de Google…</h1>
            <p className="text-sm text-neutral-500">Si ya tenías cuenta con ese correo, la fusionamos sin duplicados.</p>
          </>
        )}
        {estado === 'ok' && (
          <>
            <p className="text-3xl" aria-hidden="true">✅</p>
            <h1 className="text-lg font-bold text-emerald-800">
              {esNuevo ? '¡Cuenta creada con Google!' : '¡Bienvenido de nuevo!'}
            </h1>
            <p className="text-sm text-neutral-500">
              {esNuevo
                ? 'Tu cuenta de estudiante está lista. Te llevamos de vuelta…'
                : 'Sesión iniciada. Te llevamos de vuelta…'}
            </p>
          </>
        )}
        {estado === 'error' && (
          <>
            <p className="text-3xl" aria-hidden="true">⚠️</p>
            <h1 className="text-lg font-bold text-red-700">No se pudo completar</h1>
            <p className="text-sm text-neutral-500 break-words">{detalle}</p>
            <Link to="/perfil" className="btn-accent inline-flex justify-center">Volver a Mi Perfil</Link>
          </>
        )}
      </div>
    </div>
  )
}
