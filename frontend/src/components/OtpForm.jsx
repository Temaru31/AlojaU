// OtpForm.jsx — Verificación por código de 6 dígitos (10 min).
//
// Alternativa gratuita a SMS/WhatsApp: el código llega por Email
// (o Telegram si el operador lo configuró). Uso:
//   <OtpForm email="a@b.co" proposito="email_verify" onVerificado={...} />
import { useState } from 'react'
import { api } from '../services/api'

export default function OtpForm({ email, proposito = 'email_verify', onVerificado }) {
  const [codigo, setCodigo] = useState('')
  const [estado, setEstado] = useState('idle') // idle|enviando|verificando|ok|error
  const [mensaje, setMensaje] = useState('')

  const solicitar = async () => {
    setEstado('enviando')
    setMensaje('')
    try {
      await api.post('/api/auth/otp/solicitar', { email, proposito })
      setMensaje('Código enviado. Revisa tu correo (válido 10 minutos).')
      setEstado('idle')
    } catch (e) {
      setMensaje(e?.response?.data?.detail || 'No se pudo enviar el código.')
      setEstado('error')
    }
  }

  const verificar = async (e) => {
    e?.preventDefault()
    if (!/^[0-9]{6}$/.test(codigo)) {
      setMensaje('El código tiene 6 dígitos numéricos.')
      setEstado('error')
      return
    }
    setEstado('verificando')
    setMensaje('')
    try {
      await api.post('/api/auth/otp/verificar', { email, codigo, proposito })
      setEstado('ok')
      setMensaje('Correo verificado. Ya puedes publicar.')
      onVerificado?.()
    } catch (err) {
      setEstado('error')
      setMensaje(err?.response?.data?.detail || 'Código inválido o expirado.')
    }
  }

  return (
    <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-900">Verifica tu correo</h3>
        <button
          type="button"
          onClick={solicitar}
          disabled={estado === 'enviando'}
          className="text-xs font-semibold text-navy-700 border border-navy-200 rounded-md px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50"
        >
          {estado === 'enviando' ? 'Enviando…' : 'Enviar código'}
        </button>
      </div>
      <form onSubmit={verificar} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-label="Código de verificación de 6 dígitos"
          className="input-field tracking-[0.3em] text-center font-mono"
        />
        <button
          type="submit"
          disabled={estado === 'verificando' || codigo.length !== 6}
          className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 disabled:opacity-50 shrink-0"
        >
          {estado === 'verificando' ? 'Verificando…' : 'Verificar'}
        </button>
      </form>
      {mensaje && (
        <p
          role={estado === 'error' ? 'alert' : 'status'}
          className={`text-xs ${estado === 'error' ? 'text-red-600' : estado === 'ok' ? 'text-emerald-700' : 'text-neutral-500'}`}
        >
          {mensaje}
        </p>
      )}
    </div>
  )
}
