// OtpForm.jsx — Verificación por código de 6 dígitos (10 min).
//
// Alternativa gratuita a SMS/WhatsApp: el código llega por Email
// (o Telegram si el operador lo configuró). Uso:
//   <OtpForm email="a@b.co" proposito="email_verify" onVerificado={...} />
import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'

// Pausa anti-spam tras pedir código (el backend limita a 5/15min).
const COOLDOWN_S = 60

// Estados visuales: sin-verificar (botón Enviar) → enviado (PIN + Confirmar +
// Reenviar) → verificado (badge verde). `yaEnviado` distingue el primer envío
// del reenvío para el copy honesto del botón.
export default function OtpForm({ email, proposito = 'email_verify', onVerificado }) {
  const [codigo, setCodigo] = useState('')
  const [estado, setEstado] = useState('idle') // idle|enviando|verificando|ok|error
  const [mensaje, setMensaje] = useState('')
  const [canal, setCanal] = useState(null) // null|'email'|'telegram'
  const [cooldown, setCooldown] = useState(0)
  const [yaEnviado, setYaEnviado] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const solicitar = async () => {
    if (cooldown > 0) return
    setEstado('enviando')
    setMensaje('')
    try {
      // M3 transparencia: el backend dice por dónde viajó el código.
      const r = await api.post('/api/auth/otp/solicitar', { email, proposito })
      const c = r?.data?.canal === 'telegram' ? 'telegram' : 'email'
      setCanal(c)
      setMensaje(c === 'telegram'
        ? 'Código enviado a través de nuestro Bot oficial de Telegram (válido 10 minutos).'
        : 'Enviamos un código de 6 dígitos a tu correo (válido por 10 minutos).')
      setEstado('idle')
      setYaEnviado(true)
      setCooldown(COOLDOWN_S)
      timerRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            timerRef.current = null
            return 0
          }
          return prev - 1
        })
      }, 1000)
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
          disabled={estado === 'enviando' || cooldown > 0}
          className="min-h-[44px] text-xs font-semibold text-navy-700 border border-navy-200 rounded-md px-3 py-1.5 hover:bg-navy-50 active:bg-navy-100 disabled:opacity-50 transition"
        >
          {estado === 'enviando' ? 'Enviando…' : cooldown > 0 ? `Reenviar en ${cooldown}s` : yaEnviado ? 'Reenviar código' : 'Enviar código de verificación'}
        </button>
      </div>
      <form onSubmit={verificar} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-label="Código de verificación de 6 dígitos"
          className="input-field tracking-[0.5em] text-center font-mono !text-lg !py-3"
        />
        <button
          type="submit"
          disabled={estado === 'verificando' || codigo.length !== 6}
          className="px-4 py-2 min-h-[44px] bg-navy-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 active:bg-navy-900 disabled:opacity-50 shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
        >
          {estado === 'verificando' ? 'Verificando…' : 'Confirmar código'}
        </button>
      </form>
      {mensaje && (
        <p
          role={estado === 'error' ? 'alert' : 'status'}
          className={`text-xs ${estado === 'error' ? 'text-red-600' : estado === 'ok' ? 'text-emerald-700' : 'text-neutral-500'}`}
        >
          {estado === 'ok' ? '✓ ' : ''}{mensaje}
        </p>
      )}
    </div>
  )
}
