// RegistroForm.jsx — Registro con consentimiento Ley 1581 + Google.
//
// - Casilla obligatoria con el texto legal exacto + modales de Términos
//   y Política (rutas públicas /terminos y /privacidad como alternativa).
// - Tras registrar (rol ESTUDIANTE) pide verificar el email vía OTP.
// Uso: <RegistroForm onRegistrado={(token,email)=>...} />
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import GoogleButton from './GoogleButton'
import OtpForm from './OtpForm'
import PasswordStrength, { passwordValidaV13 } from './PasswordStrength'
import { CONSENTIMIENTO_TEXTO, TERMINOS_COMPLETOS, POLITICA_COMPLETA, LegalModal } from './Legal'
import { signInWithGoogle } from '../services/supabaseClient'

export default function RegistroForm({ onRegistrado }) {
  const [form, setForm] = useState({ email: '', password: '', nombre: '', telefono: '' })
  const [acepto, setAcepto] = useState(false)
  const [modal, setModal] = useState(null) // null|'terminos'|'privacidad'
  const [estado, setEstado] = useState('idle')
  const [error, setError] = useState('')
  const [emailCreado, setEmailCreado] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')

  const telDigitos = form.telefono.replace(/\D/g, '')
  const valida = form.email && form.nombre.trim().length >= 3
    && (telDigitos === '' || telDigitos.length >= 7)
    && passwordValidaV13(form.password) && acepto

  const registrar = async (e) => {
    e.preventDefault()
    if (!valida || estado === 'enviando') return
    setEstado('enviando')
    setError('')
    try {
      const r = await api.post('/api/auth/register', {
        email: form.email.trim(),
        password: form.password,
        nombre_completo: form.nombre.trim(),
        // v13.2 progressive profiling: el teléfono es opcional (se exige al publicar).
        telefono_whatsapp: telDigitos === '' ? null : telDigitos,
        acepto_tratamiento_datos: true,
      })
      setEmailCreado(r.data.email)
      // Auto-login tras registro para UX continua (rol ESTUDIANTE).
      try {
        const l = await api.post('/api/auth/login', { email: form.email.trim(), password: form.password })
        onRegistrado?.(l.data.access_token, r.data.email)
      } catch {
        onRegistrado?.('', r.data.email)
      }
      setEstado('ok')
    } catch (err) {
      setEstado('error')
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'No se pudo crear tu cuenta. Revisa los datos.')
    }
  }

  const conGoogle = async () => {
    setGoogleLoading(true)
    setGoogleError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setGoogleError(e?.message || 'Google OAuth no está configurado todavía.')
      setGoogleLoading(false)
    }
  }

  // Igual que en Perfil: volver con "atrás" desde Google no debe dejar
  // el botón cargando para siempre (restauración desde bfcache).
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
    <div className="space-y-5">
      <GoogleButton mode="register" loading={googleLoading} onClick={conGoogle} />
      {googleError && <p role="alert" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">{googleError}</p>}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="flex-1 h-px bg-neutral-200" />
        <span className="text-[11px] text-neutral-400">o con correo</span>
        <span className="flex-1 h-px bg-neutral-200" />
      </div>
      <form onSubmit={registrar} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="reg-nombre">Nombre completo</label>
          <input id="reg-nombre" type="text" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="input-field" required minLength={3} maxLength={150} autoComplete="name" />
        </div>
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="reg-email">Correo</label>
          <input id="reg-email" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input-field" required autoComplete="email" />
        </div>
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="reg-tel">WhatsApp <span className="text-neutral-400 font-normal">(opcional, lo podrás agregar en tu perfil; se exige al publicar)</span></label>
          <input id="reg-tel" type="tel" inputMode="numeric" value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, '').slice(0, 15) })}
            className="input-field" placeholder="3001234567" autoComplete="tel" />
        </div>
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="reg-pw">Contraseña</label>
          <input id="reg-pw" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input-field" required autoComplete="new-password" />
          <div className="mt-2"><PasswordStrength value={form.password} /></div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <input
            id="reg-acepto"
            type="checkbox"
            checked={acepto}
            onChange={(e) => setAcepto(e.target.checked)}
            required
            className="mt-1 h-4 w-4 accent-navy-800"
          />
          <label htmlFor="reg-acepto" className="text-xs text-neutral-600 leading-relaxed">
            {CONSENTIMIENTO_TEXTO}. Lee los{' '}
            <button type="button" onClick={() => setModal('terminos')} className="underline text-navy-700">Términos</button>
            {' '}y la{' '}
            <button type="button" onClick={() => setModal('privacidad')} className="underline text-navy-700">Política de Datos</button>
            {' '}o en <Link to="/terminos" className="underline">/terminos</Link> y <Link to="/privacidad" className="underline">/privacidad</Link>.
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>}
        <button type="submit" disabled={!valida || estado === 'enviando'} className="btn-accent w-full justify-center">
          {estado === 'enviando' ? 'Creando tu cuenta…' : 'Crear cuenta de estudiante'}
        </button>
        <p className="text-[11px] text-neutral-400 text-center">
          Tu cuenta inicia como ESTUDIANTE. Al publicar tu primer aviso se promueve a ARRENDADOR.
        </p>
      </form>
      {emailCreado && (
        <OtpForm email={emailCreado} proposito="email_verify" onVerificado={() => { }} />
      )}
      <LegalModal titulo="Términos de Servicio" contenido={TERMINOS_COMPLETOS}
        abierto={modal === 'terminos'} onCerrar={() => setModal(null)} />
      <LegalModal titulo="Política de Datos (Ley 1581 de 2012)" contenido={POLITICA_COMPLETA}
        abierto={modal === 'privacidad'} onCerrar={() => setModal(null)} />
    </div>
  )
}
