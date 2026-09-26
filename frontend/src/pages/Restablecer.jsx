// Restablecer.jsx — Pantalla de cambio con indicador de fortaleza v13.
// Recibe ?email=...&token=... (enlace de un solo uso, 15 min).
// Uso: ruta /restablecer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import PasswordStrength, { passwordValidaV13 } from '../components/PasswordStrength'

export default function Restablecer() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const email = params.get('email') || ''
  const token = params.get('token') || ''
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [estado, setEstado] = useState('idle')
  const [mensaje, setMensaje] = useState('')
  // Bloque 3: el redirect diferido se cancela al desmontar.
  const navTimer = useRef(null)
  useEffect(() => () => window.clearTimeout(navTimer.current), [])

  const valida = useMemo(
    () => passwordValidaV13(nueva) && nueva === confirmar && email && token,
    [nueva, confirmar, email, token],
  )

  const guardar = async (e) => {
    e.preventDefault()
    if (!valida) return
    setEstado('guardando')
    setMensaje('')
    try {
      await api.post('/api/auth/recovery/confirmar', {
        email, token, nueva_password: nueva,
      })
      setEstado('ok')
      setMensaje('Contraseña restablecida. Tus sesiones anteriores fueron revocadas.')
      // Bloque 3: navegar solo si se sigue montado (limpieza al desmontar).
      navTimer.current = window.setTimeout(() => navigate('/perfil'), 1500)
    } catch (err) {
      setEstado('error')
      setMensaje(err?.response?.data?.detail || 'Enlace inválido, expirado o ya usado.')
    }
  }

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-xl mx-auto card p-6 md:p-8">
        <h1 className="font-display text-2xl font-bold text-navy-900 mb-2">Crea tu nueva contraseña</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Para <b>{email || 'tu cuenta'}</b>. El enlace es de un solo uso y expira en 15 minutos.
        </p>
        <form onSubmit={guardar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="nueva-pw">
              Nueva contraseña
            </label>
            <input
              id="nueva-pw"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              className="input-field"
              autoComplete="new-password"
              required
            />
            <div className="mt-2">
              <PasswordStrength value={nueva} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="conf-pw">
              Confirma la contraseña
            </label>
            <input
              id="conf-pw"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="input-field"
              autoComplete="new-password"
              required
            />
            {confirmar && nueva !== confirmar && (
              <p className="text-xs text-red-600 mt-1">Las contraseñas no coinciden.</p>
            )}
          </div>
          {mensaje && (
            <p role={estado === 'error' ? 'alert' : 'status'}
              className={`text-sm rounded-md p-2 border ${estado === 'error'
                ? 'text-red-600 bg-red-50 border-red-200'
                : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
              {mensaje}
            </p>
          )}
          <button type="submit" disabled={!valida || estado === 'guardando'} className="btn-accent w-full justify-center">
            {estado === 'guardando' ? 'Guardando…' : 'Restablecer contraseña'}
          </button>
        </form>
        <p className="text-xs text-neutral-400 mt-4 text-center">
          <Link to="/perfil" className="underline hover:text-navy-600">Volver a iniciar sesión</Link>
        </p>
      </div>
    </div>
  )
}
