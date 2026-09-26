// TelegramVincular — M5 vinculación $0.
// El botón "Abrir Bot de Telegram" consume DIRECTAMENTE `bot_url` del
// endpoint POST /api/auth/telegram/vincular-inicio (token HMAC 1 uso, 5min).
// F5 modo local: si el backend responde 503 (bot sin configurar en dev), se
// ofrece una simulación de interfaz claramente etiquetada que NUNCA marca la
// cuenta como vinculada (solo demuestra el flujo visual del PIN de 6).
// Uso: <TelegramVincular token={token} vinculado={perfil?.telegram_vinculado} />
import { useState } from 'react'
import { api } from '../services/api'

export function esErrorSinBot(err) {
  return err?.response?.status === 503
}

// Guía infalible en 3 pasos: 1) abrir el bot 2) pulsar /start en Telegram
// 3) comprobar aquí. La confirmación es REAL: re-lee el perfil y solo marca
// vinculado si el backend ya registró el chat (el bot lo hace al /start).
// No existe endpoint de "verificar PIN": inventarlo sería placebo.
export default function TelegramVincular({ token, vinculado, onVinculado }) {
  const [cargando, setCargando] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [error, setError] = useState('')
  const [botAbierto, setBotAbierto] = useState(false)
  const [modoLocal, setModoLocal] = useState(false)
  const [pinSim, setPinSim] = useState('')
  const [pinOk, setPinOk] = useState(false)

  const abrirBot = async () => {
    setError('')
    setModoLocal(false)
    setPinSim('')
    setPinOk(false)
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
      // window.open no lanza con bloqueador (retorna null): fallback a href.
      const ventana = window.open(url, '_blank', 'noopener,noreferrer')
      if (!ventana) window.location.href = url
      setBotAbierto(true)
    } catch (e) {
      if (esErrorSinBot(e)) {
        setModoLocal(true)
      } else {
        setError(e?.response?.data?.detail || e?.message || 'No se pudo abrir el bot. Intenta por correo.')
      }
    } finally {
      setCargando(false)
    }
  }

  const probarPinSimulado = (e) => {
    e?.preventDefault()
    // Simulación de interfaz: acepta cualquier PIN de 6 dígitos solo para
    // mostrar el estado visual; no toca el backend ni la vinculación real.
    if (/^[0-9]{6}$/.test(pinSim)) setPinOk(true)
  }

  const comprobarVinculacion = async () => {
    setComprobando(true)
    setError('')
    try {
      const r = await api.get('/api/auth/perfil', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (r.data?.telegram_vinculado) {
        onVinculado?.(true)
      } else {
        setError('Aún no detectamos tu /start. Abre el bot, pulsa /start y vuelve a intentarlo.')
      }
    } catch {
      setError('No se pudo comprobar. Intenta de nuevo.')
    } finally {
      setComprobando(false)
    }
  }

  // El simulador solo existe en desarrollo local (nunca en producción).
  const esDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Telegram gratis (opcional)</h3>
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
          ? 'Los códigos te llegan al chat de Telegram. Nunca pedimos códigos en grupos.'
          : 'Vincula tu cuenta para recibir los códigos en tu chat de Telegram. Si no vinculas, llegan por correo.'}
      </p>
      {!vinculado && (
        <ol className="space-y-2.5 pt-1">
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-2">1</span>
            <div className="flex-1">
              <button
                type="button"
                onClick={abrirBot}
                disabled={cargando}
                className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-navy-800 rounded-lg hover:bg-navy-900 active:bg-navy-900 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
              >
                {cargando ? 'Abriendo…' : 'Abrir Bot en Telegram'}
              </button>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Dentro de Telegram presiona el botón <code className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-[11px]">/start</code> para recibir tu PIN de 6 dígitos.
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-2">3</span>
            <div className="flex-1">
              <button
                type="button"
                onClick={comprobarVinculacion}
                disabled={comprobando}
                className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm font-semibold text-navy-800 bg-white border-2 border-navy-800 rounded-lg hover:bg-navy-50 active:bg-navy-100 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
              >
                {comprobando ? 'Comprobando…' : 'Vincular cuenta'}
              </button>
              <p className="text-[11px] text-neutral-400 mt-1">El bot confirma solo; aquí verificamos que ya quedó vinculado.</p>
            </div>
          </li>
        </ol>
      )}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      {/* F5: sin bot configurado el backend da 503. En dev se ofrece
          simulación visual; en prod, mensaje de mantenimiento. */}
      {modoLocal && !vinculado && (esDev ? (
        <div className="rounded-lg border border-dashed border-navy-300 bg-navy-50/50 p-3 space-y-2" role="region" aria-label="Modo de pruebas local">
          <p className="text-xs font-semibold text-navy-800">
            Modo de pruebas local detectado. Ingresa cualquier código simulado de 6 dígitos para probar el flujo de interfaz
          </p>
          <p className="text-[11px] text-neutral-500">
            Simulación visual: no vincula tu cuenta ni envía nada a Telegram.
          </p>
          {pinOk ? (
            <p className="text-[11px] font-semibold text-emerald-700" role="status">
              ✓ Flujo simulado correcto (en producción el bot confirmaría aquí).
            </p>
          ) : (
            <form onSubmit={probarPinSimulado} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={pinSim}
                onChange={(e) => setPinSim(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                aria-label="Código simulado de 6 dígitos"
                maxLength={6}
                className="input-field tracking-[0.3em] text-center font-mono"
              />
              <button
                type="submit"
                disabled={pinSim.length !== 6}
                className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 disabled:opacity-50 shrink-0"
              >
                Probar
              </button>
            </form>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-neutral-500" role="note">
          Bot en mantenimiento por ahora: usa el código por correo.
        </p>
      ))}
    </div>
  )
}
