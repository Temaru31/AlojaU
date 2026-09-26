// TelegramVincular — M5 vinculación $0.
// El botón "Abrir Bot de Telegram" consume DIRECTAMENTE `bot_url` del
// endpoint POST /api/auth/telegram/vincular-inicio (token HMAC 1 uso, 5min).
// Uso: <TelegramVincular token={token} vinculado={perfil?.telegram_vinculado} />
import { useState } from 'react'
import { api } from '../services/api'

export default function TelegramVincular({ token, vinculado }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const abrirBot = async () => {
    setError('')
    setCargando(true)
    try {
      const r = await api.post('/api/auth/telegram/vincular-inicio', {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const url = r.data?.bot_url
      if (!url || !url.startsWith('https://t.me/')) {
        throw new Error('Respuesta inválida del bot')
      }
      // Consume directamente el bot_url del backend (sin construirlo aquí).
      try {
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        window.location.href = url
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'No se pudo abrir el bot. Intenta por correo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Telegram $0 (opcional)</h3>
        {vinculado ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            ✓ Vinculado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
            Sin vincular
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">
        {vinculado
          ? 'Recibirás los códigos por mensaje directo (DM). Nunca pedimos códigos en grupos.'
          : 'Vincula tu cuenta para recibir códigos por DM. Si no vinculas, los códigos llegan por correo.'}
      </p>
      {!vinculado && (
        <button
          type="button"
          onClick={abrirBot}
          disabled={cargando}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#229ED9] rounded-md hover:brightness-95 transition disabled:opacity-50"
        >
          {cargando ? 'Abriendo…' : 'Abrir Bot de Telegram'}
        </button>
      )}
      {error && <p className="text-[11px] text-red-600" role="alert">{error}</p>}
    </div>
  )
}
