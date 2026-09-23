// Recuperar.jsx — "Olvidé mi contraseña": solicita el enlace (15 min).
// El enlace real llega por email; en dev el backend devuelve dev_token
// para e2e sin SMTP. Uso: ruta /recuperar.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

export default function Recuperar() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState('idle')
  const [mensaje, setMensaje] = useState('')
  const [devToken, setDevToken] = useState('')

  const enviar = async (e) => {
    e.preventDefault()
    setEstado('enviando')
    setMensaje('')
    setDevToken('')
    try {
      const r = await api.post('/api/auth/recovery/solicitar', { email })
      setMensaje(r.data?.mensaje || 'Si el correo existe, enviamos un enlace válido 15 minutos.')
      if (r.data?.dev_token) setDevToken(r.data.dev_token)
      setEstado('ok')
    } catch (err) {
      setEstado('error')
      setMensaje(err?.response?.data?.detail || 'No se pudo procesar la solicitud.')
    }
  }

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-xl mx-auto">
        <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link to="/perfil" className="hover:text-navy-600">Mi Perfil</Link>
          <span aria-hidden="true">›</span>
          <span className="text-neutral-600">Recuperar contraseña</span>
        </nav>
        <div className="card p-6 md:p-8">
          <h1 className="font-display text-2xl font-bold text-navy-900 mb-2">Olvidé mi contraseña</h1>
          <p className="text-sm text-neutral-500 mb-6">
            Te enviamos un enlace firmado de un solo uso, válido 15 minutos.
          </p>
          <form onSubmit={enviar} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="rec-email">
                Correo de tu cuenta
              </label>
              <input
                id="rec-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                autoComplete="email"
              />
            </div>
            {mensaje && (
              <p role={estado === 'error' ? 'alert' : 'status'}
                className={`text-sm rounded-md p-2 border ${estado === 'error'
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                {mensaje}
              </p>
            )}
            {devToken && (
              <p className="text-xs text-neutral-500">
                Modo desarrollo: continúa en{' '}
                <Link className="text-navy-700 underline"
                  to={`/restablecer?email=${encodeURIComponent(email)}&token=${encodeURIComponent(devToken)}`}>
                  restablecer con este enlace
                </Link>.
              </p>
            )}
            <button type="submit" disabled={estado === 'enviando'} className="btn-accent w-full justify-center">
              {estado === 'enviando' ? 'Enviando…' : 'Enviar enlace de recuperación'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
