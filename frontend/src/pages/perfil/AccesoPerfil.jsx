import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { emitAuthChange } from '../../contexts/AuthContext'
import { guardarToken } from '../../services/tokenStorage'
import { signInWithGoogle } from '../../services/supabaseClient'
import GoogleButton from '../../components/GoogleButton'
import RegistroForm from '../../components/RegistroForm'
import { iniciarSesionConCorreo } from '../../services/cuentaApi'
import { mensajeDeError } from '../../services/erroresApi'

// Vista de Mi Perfil sin sesión: Google, login con email o registro.
export default function AccesoPerfil({ onSesionIniciada }) {
  const [error, setError] = useState('')
  const [modoAuth, setModoAuth] = useState('login') // login|registro
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const iniciarSesion = (t) => {
    guardarToken(t)
    onSesionIniciada(t)
    emitAuthChange() // UX: avisa al navbar para mostrar el avatar al instante
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginLoading(true)
    setError('')
    try {
      const sesion = await iniciarSesionConCorreo(loginEmail, loginPass)
      iniciarSesion(sesion.access_token)
    } catch (err) {
      setError(mensajeDeError(err, 'Error al iniciar sesión'))
    } finally {
      setLoginLoading(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(e?.message || 'Google OAuth no está configurado todavía.')
      setGoogleLoading(false)
    }
  }

  // Si el usuario va a Google y vuelve con "atrás", la página puede restaurarse
  // del bfcache con loading=true eternamente: al recuperar visibilidad se resetea.
  useEffect(() => {
    const alVolver = () => setGoogleLoading(false)
    const alVisibles = () => { if (document.visibilityState === 'visible') setGoogleLoading(false) }
    window.addEventListener('pageshow', alVolver)
    document.addEventListener('visibilitychange', alVisibles)
    return () => {
      window.removeEventListener('pageshow', alVolver)
      document.removeEventListener('visibilitychange', alVisibles)
    }
  }, [])

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-xl mx-auto">
        <nav aria-label="Migas de pan" className="hidden md:flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-neutral-600">Mi Perfil</span>
        </nav>

        <div className="card p-4 sm:p-6 md:p-8">
          <div className="w-12 h-12 bg-navy-50 text-navy-800 rounded-xl flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-navy-900 tracking-tight mb-2">
            Mi Perfil
          </h1>
          <p className="text-sm text-neutral-500 mb-4">
            Debes iniciar sesión para ver y editar tu información de contacto.
          </p>

          <GoogleButton loading={googleLoading} onClick={handleGoogle} />
          <div className="flex items-center gap-3 my-4" aria-hidden="true">
            <span className="flex-1 h-px bg-neutral-200" />
            <span className="text-[11px] text-neutral-400">o</span>
            <span className="flex-1 h-px bg-neutral-200" />
          </div>
          <div className="flex gap-1 mb-4 border-b border-neutral-150" role="tablist" aria-label="Entrar o crear cuenta">
            <button type="button" role="tab" aria-selected={modoAuth === 'login'}
              onClick={() => setModoAuth('login')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${modoAuth === 'login' ? 'border-gold-400 text-navy-900' : 'border-transparent text-neutral-400'}`}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={modoAuth === 'registro'}
              onClick={() => setModoAuth('registro')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${modoAuth === 'registro' ? 'border-gold-400 text-navy-900' : 'border-transparent text-neutral-400'}`}>
              Crear cuenta
            </button>
          </div>

          {modoAuth === 'registro' ? (
            <RegistroForm onRegistrado={(t) => { if (t) iniciarSesion(t) }} />
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                className="input-field"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>}
            <button type="submit" disabled={loginLoading} className="btn-accent w-full justify-center">
              {loginLoading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
            <p className="text-xs text-center">
              <Link to="/recuperar" className="text-navy-700 underline hover:text-navy-900">
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          </form>
          )}
        </div>
      </div>
    </div>
  )
}
