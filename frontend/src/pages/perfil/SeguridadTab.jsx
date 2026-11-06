import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import { emitAuthChange, limpiarSesionLocal } from '../../contexts/AuthContext'
import { formatearSesionFecha, etiquetaDispositivo } from '../../utils/sesion'
import { fortalezaPassword } from '../../utils/perfil'
import ConfirmDialog from '../../components/ConfirmDialog'
import { notifyToast } from '../../components/Toast'
import { cambiarPassword, eliminarCuenta, listarSesiones, revocarTodasLasSesiones } from '../../services/cuentaApi'
import { mensajeDeError } from '../../services/erroresApi'

// Pestaña Seguridad: contraseña, sesiones activas y borrado de cuenta.
// `onCuentaCerrada` se llama cuando este token deja de valer (revocación o borrado).
export default function SeguridadTab({ token, perfil, onError, onCuentaCerrada }) {
  const setError = onError
  const [pwActual, setPwActual] = useState('')
  const [pwNueva, setPwNueva] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  // Sesiones activas + revocación global.
  const [sesiones, setSesiones] = useState(null)
  const [revocando, setRevocando] = useState(false)
  // Revocar todo cierra ESTA sesión también -> confirma en 2 pasos.
  const [aRevocar, setARevocar] = useState(false)

  // Eliminación de cuenta (soft-delete 30 días).
  const [mostrarEliminar, setMostrarEliminar] = useState(false)
  const [delEmail, setDelEmail] = useState('')
  const [delPass, setDelPass] = useState('')
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    if (token) cargarSesiones(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga solo al cambiar de sesión
  }, [token])

  const handleEliminarCuenta = async (e) => {
    e?.preventDefault()
    if (!token || eliminando) return
    setEliminando(true)
    setError('')
    try {
      await eliminarCuenta(delEmail, delPass, token)
      // Limpieza total compartida (no solo el token).
      limpiarSesionLocal()
      onCuentaCerrada()
      emitAuthChange()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la cuenta.'))
    } finally {
      setEliminando(false)
    }
  }

  const cargarSesiones = async (authToken) => {
    try {
      setSesiones(await listarSesiones(authToken))
    } catch {
      setSesiones(null)
    }
  }

  const revocarTodas = async () => {
    if (!token) return
    if (!aRevocar) {
      setARevocar(true)
      return
    }
    setRevocando(true)
    setError('')
    try {
      await revocarTodasLasSesiones(token)
      // Este token también murió -> limpieza total + raíz (sin fantasma).
      setARevocar(false)
      limpiarSesionLocal()
      setSesiones(null)
      onCuentaCerrada()
      emitAuthChange()
      try { window.location.replace('/') } catch { /* SSR/tests */ }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron revocar las sesiones.'))
      setARevocar(false)
    } finally {
      setRevocando(false)
    }
  }

  const handleCambiarPassword = async (e) => {
    e?.preventDefault()
    setPwSaving(true)
    setError('')
    try {
      await cambiarPassword(pwActual, pwNueva, token)
      notifyToast('Contraseña actualizada con éxito')
      setPwActual('')
      setPwNueva('')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo actualizar la contraseña.'))
    } finally {
      setPwSaving(false)
    }
  }

  const fort = fortalezaPassword(pwNueva)
  const pwValida = pwActual.trim() !== '' && fort.longitud && fort.alfanumerica && pwNueva !== pwActual

  return (
    <div id="panel-seguridad" role="tabpanel" aria-labelledby="tab-seguridad" aria-label="Seguridad y contraseña" tabIndex={0} className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
      <h2 className="text-base font-semibold text-navy-900">Cambiar contraseña</h2>
      {perfil?.auth_provider === 'google' ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" role="note">
          <p className="text-sm font-semibold text-emerald-800 flex items-start gap-1.5">
            <Lock aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" /> Tu cuenta utiliza inicio de sesión seguro con Google.
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            No requiere una contraseña local: entras con tu cuenta de Google y ya está verificada.
          </p>
        </div>
      ) : (
      <>
      <p className="text-xs text-neutral-500">Te pedimos la actual por seguridad. La nueva debe tener al menos 8 caracteres con letras y números.</p>
      <form onSubmit={handleCambiarPassword} className="space-y-4">
        <div>
          <label htmlFor="perfil-pw-actual" className="block text-sm font-medium text-navy-800 mb-1.5">Contraseña actual</label>
          <input
            id="perfil-pw-actual"
            type="password"
            value={pwActual}
            onChange={e => setPwActual(e.target.value)}
            className="input-field"
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label htmlFor="perfil-pw-nueva" className="block text-sm font-medium text-navy-800 mb-1.5">Nueva contraseña</label>
          <input
            id="perfil-pw-nueva"
            type="password"
            value={pwNueva}
            onChange={e => setPwNueva(e.target.value)}
            className="input-field"
            autoComplete="new-password"
            required
          />
          <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
            <li className={`${fort.longitud ? 'text-emerald-700' : 'text-neutral-400'} flex items-center gap-1.5`}>
              {fort.longitud ? <Check aria-hidden="true" className="w-4 h-4" /> : <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current inline-block ml-1 mr-1" />} Mínimo 8 caracteres
            </li>
            <li className={`${fort.alfanumerica ? 'text-emerald-700' : 'text-neutral-400'} flex items-center gap-1.5`}>
              {fort.alfanumerica ? <Check aria-hidden="true" className="w-4 h-4" /> : <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current inline-block ml-1 mr-1" />} Incluye letras y números
            </li>
            <li className={`${pwNueva && pwNueva !== pwActual ? 'text-emerald-700' : 'text-neutral-400'} flex items-center gap-1.5`}>
              {pwNueva && pwNueva !== pwActual ? <Check aria-hidden="true" className="w-4 h-4" /> : <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current inline-block ml-1 mr-1" />} Distinta de la actual
            </li>
          </ul>
        </div>
        <button
          type="submit"
          disabled={pwSaving || !pwValida}
          className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
        >
          {pwSaving ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </form>
      <p className="text-xs">
        <Link to="/recuperar" className="text-navy-700 underline hover:text-navy-900">
          ¿Olvidaste tu contraseña? Recupérala con un enlace de 15 minutos
        </Link>
      </p>
      </>
      )}
      {/* v13: sesiones activas + revocación global (Telegram vive en Datos y Verificación) */}
      <div className="border-t border-neutral-150 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-navy-900">Sesiones activas</h3>
        {sesiones == null ? (
          <p className="text-xs text-neutral-400">Cargando sesiones…</p>
        ) : sesiones.length === 0 ? (
          <p className="text-xs text-neutral-400">No hay sesiones registradas (modo sin base de datos).</p>
        ) : (
          <ul className="space-y-1.5">
            {sesiones.map((s) => {
              const fecha = formatearSesionFecha(s.creado_en) || 'reciente'
              return (
                <li key={s.jti} className="flex items-center justify-between gap-2 text-xs bg-neutral-50 border border-neutral-150 rounded-md px-3 py-2">
                  <span className="text-neutral-600 truncate">
                    {etiquetaDispositivo(s.user_agent)} · {fecha}
                    {s.actual ? ' · este dispositivo' : ''}
                  </span>
                  {s.actual && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                      Actual
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={revocarTodas}
          onBlur={() => setARevocar(false)}
          disabled={revocando}
          aria-label={aRevocar ? 'Confirmar cierre en todos los dispositivos' : 'Cerrar sesión en todos los dispositivos'}
          className={`px-4 py-2 text-xs font-semibold rounded-md border transition disabled:opacity-50 ${aRevocar
            ? 'bg-red-600 border-red-600 text-white hover:bg-red-700'
            : 'text-red-600 border-red-200 hover:bg-red-50'
            }`}
        >
          {revocando ? 'Cerrando…' : aRevocar ? '¿Cerrar todas? Incluye este dispositivo' : 'Cerrar sesión en todos los dispositivos'}
        </button>
      </div>
      {/* v13.1 zona de peligro: modal explicativo (nunca cambia el texto del botón). */}
      <div className="border-t border-red-100 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-red-700">Zona de peligro</h3>
        <button
          type="button"
          onClick={() => { setDelEmail(''); setDelPass(''); setMostrarEliminar(true) }}
          className="px-4 py-2 min-h-[44px] text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 active:bg-red-100 transition"
        >
          Eliminar mi cuenta…
        </button>
        {mostrarEliminar && (
          <ConfirmDialog
            titulo="¿Desactivar y eliminar tu cuenta?"
            descripcion="Tu cuenta se desactivará inmediatamente y se borrará definitivamente en 30 días. Durante este plazo puedes recuperarla iniciando sesión de nuevo."
            cancelar="Cancelar"
            confirmar="Sí, eliminar mi cuenta"
            peligro
            ocupado={eliminando}
            confirmarDeshabilitado={delEmail.trim() !== (perfil?.email || '').trim()}
            onCancelar={() => { if (!eliminando) { setMostrarEliminar(false); setDelEmail(''); setDelPass('') } }}
            onConfirmar={() => handleEliminarCuenta()}
          >
            <div className="space-y-2">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Para confirmar, escribe tu correo
                {perfil?.auth_provider === 'password' ? ' y tu contraseña actual' : ''}:
              </p>
              <input
                type="email"
                value={delEmail}
                onChange={(e) => setDelEmail(e.target.value)}
                placeholder={perfil?.email || 'tu@correo.com'}
                aria-label="Correo de confirmación para eliminar la cuenta"
                aria-describedby="delEmail-ayuda"
                className="input-field"
              />
              <p id="delEmail-ayuda" className="text-xs text-neutral-500" aria-live="polite">
                {delEmail.trim() === (perfil?.email || '').trim()
                  ? 'El correo coincide.'
                  : 'Escríbelo letra por letra, igual que tu correo de cuenta.'}
              </p>
              {perfil?.auth_provider === 'password' && (
                <input
                  type="password"
                  value={delPass}
                  onChange={(e) => setDelPass(e.target.value)}
                  placeholder="Contraseña actual"
                  aria-label="Contraseña actual para eliminar la cuenta"
                  className="input-field"
                />
              )}
              <p className="text-[11px] text-neutral-500">
                ¿Cambiaste de idea? <Link to="/recuperar" className="underline">Recupera tu cuenta aquí</Link>.
              </p>
            </div>
          </ConfirmDialog>
        )}
      </div>
    </div>
  )
}
