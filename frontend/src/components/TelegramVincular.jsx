// TelegramVincular — M5 vinculación $0.
// El enlace "Abrir Bot en Telegram" es un <a> nativo con el `bot_url`
// pre-generado del endpoint GET /api/auth/telegram/enlace (token HMAC
// 1 uso, 10min): ningún bloqueador lo intercepta (cero window.open).
// F5 modo local: si el backend responde 503 (bot sin configurar en dev), se
// ofrece una simulación de interfaz claramente etiquetada que NUNCA marca la
// cuenta como vinculada (solo demuestra el flujo visual del PIN de 6).
// Uso: <TelegramVincular token={token} vinculado={perfil?.telegram_vinculado} />
import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { notifyToast } from './Toast'
import ConfirmDialog from './ConfirmDialog'

export function esErrorSinBot(err) {
  return err?.response?.status === 503
}

// Guía infalible en 3 pasos: 1) abrir el bot 2) pulsar /start en Telegram
// 3) comprobar aquí. La confirmación es REAL: re-lee el perfil y solo marca
// vinculado si el backend ya registró el chat (el bot lo hace al /start).
// No existe endpoint de "verificar PIN": inventarlo sería placebo.
// Verificación gratuita: compartir el contacto NATIVO en el bot marca
// telefono_verificado=true en BD (sin SMS de pago).
// Enlace pre-generado: el deep link t.me se pide al montar (GET
// /api/auth/telegram/enlace) y el botón es un <a> nativo con target=_blank:
// ningún bloqueador lo intercepta ni hay pestañas about:blank ni
// window.open/location.href en todo el flujo.
// Polling suave: tras pulsar el enlace se sondea el perfil cada 3s (máx
// 3min); al detectar telegram_vinculado se avisa con toast y se actualiza.
// Uso: <TelegramVincular token vinculado onVinculado telefonoGuardado telefonoVerificado />
export const TELEGRAM_POLL_MS = 3000
export const TELEGRAM_POLL_MAX = 60 // 3 min

export default function TelegramVincular({
  token, vinculado, onVinculado, onDesvinculado,
  telefonoGuardado = true, telefonoVerificado = false,
}) {
  const [cargandoEnlace, setCargandoEnlace] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [error, setError] = useState('')
  const [botAbierto, setBotAbierto] = useState(false)
  const [enlace, setEnlace] = useState('')
  const [expiraSeg, setExpiraSeg] = useState(0)
  const [intentos, setIntentos] = useState(0)
  const [modoLocal, setModoLocal] = useState(false)
  const [pinSim, setPinSim] = useState('')
  const [pinOk, setPinOk] = useState(false)
  const [confirmaDesvincular, setConfirmaDesvincular] = useState(false)
  const [desvinculando, setDesvinculando] = useState(false)

  // Guard de desmontaje: los reintentos duermen hasta 3s; sin esto habría
  // setState sobre componente desmontado al navegar en mitad del check.
  const vivoRef = useRef(true)
  useEffect(() => () => { vivoRef.current = false }, [])
  // Ref al callback (inline en el padre): el polling no debe reiniciarse
  // en cada render por identidad nueva de la función.
  const onVinculadoRef = useRef(onVinculado)
  onVinculadoRef.current = onVinculado

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // Polling suave tras abrir el bot: detecta la verificación sin que el
  // usuario pulse nada. Se detiene al vincular, al desmontar o a los 3min.
  useEffect(() => {
    if (!botAbierto || vinculado) return undefined
    let cancelado = false
    const sondear = async () => {
      for (let i = 0; i < TELEGRAM_POLL_MAX; i += 1) {
        await sleep(TELEGRAM_POLL_MS)
        if (cancelado || !vivoRef.current) return
        try {
          const r = await api.get('/api/auth/perfil', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (cancelado || !vivoRef.current) return
          if (r.data?.telegram_vinculado) {
            onVinculadoRef.current?.(true)
            notifyToast('¡Número verificado con éxito en AlojaU! 🎉')
            return
          }
        } catch {
          // Sigue sondeando hasta el tope (cold start de Render).
        }
      }
    }
    sondear()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botAbierto, vinculado, token])

  // Enlace pre-generado (deep link firmado por el backend). Se pide al
  // montar y se refresca solo antes de expirar: cuando el usuario pulsa,
  // el <a> ya tiene href válido y el navegador abre Telegram sin
  // intermediarios (cero window.open, cero about:blank, cero bloqueos).
  const pedirEnlace = async (silencioso = false) => {
    if (!token || !telefonoGuardado || vinculado) return
    if (!silencioso) {
      setError('')
      setModoLocal(false)
      setPinSim('')
      setPinOk(false)
      setCargandoEnlace(true)
    }
    try {
      const r = await api.get('/api/auth/telegram/enlace', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const url = r.data?.bot_url
      if (!url || !url.startsWith('https://t.me/')) {
        throw new Error('Respuesta inválida del bot')
      }
      if (!vivoRef.current) return
      setEnlace(url)
      setExpiraSeg(r.data?.expira_segundos || 600)
    } catch (e) {
      if (!vivoRef.current) return
      if (esErrorSinBot(e)) {
        setModoLocal(true)
      } else if (!silencioso) {
        setError(e?.response?.data?.detail || e?.message || 'No se pudo preparar el enlace. Reintenta.')
      }
      // Silencioso: conserva el enlace anterior hasta que expire.
    } finally {
      if (vivoRef.current && !silencioso) setCargandoEnlace(false)
    }
  }

  // Pedido inicial al montar / cambiar de cuenta o de teléfono.
  useEffect(() => {
    setEnlace('')
    setExpiraSeg(0)
    pedirEnlace(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, telefonoGuardado, vinculado])

  // Refresco transparente 30s antes de expirar (el backend reutiliza el
  // vínculo vigente, así que normalmente no acuña nada nuevo ni invalida).
  useEffect(() => {
    if (!enlace || !expiraSeg || vinculado || !telefonoGuardado) return undefined
    const ms = Math.max(30000, expiraSeg * 1000 - 30000)
    const t = window.setTimeout(() => { pedirEnlace(true) }, ms)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enlace, expiraSeg, vinculado, telefonoGuardado])

  // Libera el chat y el número para que otra cuenta pueda usarlos.
  // La página actual no navega en ningún caso (POST + estado local).
  const desvincular = async () => {
    setError('')
    setDesvinculando(true)
    try {
      await api.post('/api/auth/telegram/desvincular', {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setBotAbierto(false)
      setEnlace('')
      setExpiraSeg(0)
      setConfirmaDesvincular(false)
      onDesvinculado?.()
      notifyToast('Telegram desvinculado y número liberado.')
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'No se pudo desvincular. Intenta de nuevo.')
      setConfirmaDesvincular(false)
    } finally {
      if (vivoRef.current) setDesvinculando(false)
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
      // Bloque 1: el webhook de Telegram puede tardar unos segundos en
      // procesar el /start (cold start de Render). Reintenta con backoff
      // 3 intentos (~0s, 1s, 2s) antes de mostrar "no detectado".
      const delays = [0, 1000, 2000]
      for (let i = 0; i < delays.length; i += 1) {
        if (delays[i]) await sleep(delays[i])
        if (!vivoRef.current) return
        try {
          const r = await api.get('/api/auth/perfil', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (!vivoRef.current) return
          if (r.data?.telegram_vinculado) {
            onVinculado?.(true)
            setIntentos(0)
            return
          }
        } catch {
          // Sigue al siguiente intento salvo que sea el último.
          if (i === delays.length - 1) throw new Error('red')
        }
        if (vivoRef.current) setIntentos(i + 1)
      }
      if (!vivoRef.current) return
      setError('Aún no detectamos tu /start. Abre el bot, pulsa /start y vuelve a intentarlo. Si el enlace expiró (10 min), genera uno nuevo con «Abrir Bot».')
    } catch {
      if (!vivoRef.current) return
      setError('No se pudo comprobar (el servidor puede estar despertando). Espera unos segundos e intenta de nuevo.')
    } finally {
      if (vivoRef.current) setComprobando(false)
    }
  }

  // El simulador solo existe en desarrollo local (nunca en producción).
  const esDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV
  // Prerrequisito: sin número guardado en el perfil no hay nada que
  // verificar (el backend también lo exige). Tarjeta opaca y bloqueada.
  const bloqueado = !telefonoGuardado && !vinculado
  return (
    <div className={`rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2 ${bloqueado ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Telegram gratis (opcional)</h3>
        {vinculado ? (
          telefonoVerificado ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ✓ Teléfono y Telegram Verificados (+20 pts)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ✓ Vinculado
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
            Sin vincular
          </span>
        )}
      </div>
      {bloqueado && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2" role="note">
          Ingresa y guarda tu número de WhatsApp arriba para habilitar la vinculación.
        </p>
      )}
      <p className="text-xs text-neutral-500 leading-relaxed">
        {vinculado
          ? 'Los códigos te llegan al chat de Telegram. Nunca pedimos códigos en grupos.'
          : 'Vincula tu cuenta para recibir los códigos en tu chat de Telegram. Si no vinculas, llegan por correo.'}
      </p>
      {vinculado && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => { setError(''); setConfirmaDesvincular(true) }}
            className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 rounded"
          >
            Desvincular Telegram y liberar mi número
          </button>
          {confirmaDesvincular && (
            <ConfirmDialog
              titulo="Desvincular Telegram"
              descripcion="Se desvinculará tu chat y se liberará tu número para que otra cuenta pueda usarlo. Perderás la verificación telefónica (+20 pts) y no podrás publicar hasta registrar otro número."
              cancelar="Cancelar"
              confirmar="Sí, desvincular y liberar"
              peligro
              ocupado={desvinculando}
              onCancelar={() => { if (!desvinculando) setConfirmaDesvincular(false) }}
              onConfirmar={desvincular}
            />
          )}
        </div>
      )}
      {!vinculado && (
        <ol className="space-y-2.5 pt-1">
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-2">1</span>
            <div className="flex-1">
              {enlace ? (
                <a
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setError(''); setBotAbierto(true); setIntentos(0) }}
                  className={`inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-navy-800 rounded-lg hover:bg-navy-900 active:bg-navy-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40 ${bloqueado ? 'pointer-events-none opacity-50' : ''}`}
                  aria-disabled={bloqueado || undefined}
                >
                  Abrir Bot en Telegram
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => pedirEnlace(false)}
                  disabled={cargandoEnlace || bloqueado}
                  className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-navy-800 rounded-lg hover:bg-navy-900 active:bg-navy-900 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
                >
                  {cargandoEnlace ? 'Preparando enlace…' : 'Reintentar enlace'}
                </button>
              )}
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
            <div className="flex-1">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Dentro de Telegram presiona el botón <code className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-[11px]">/start</code> y
                luego comparte tu número con <b>📱 Compartir mi número de teléfono para verificar</b> para confirmar que la cuenta es tuya (debe ser el guardado en tu perfil).
              </p>
              {enlace && (
                <p className="text-[11px] text-neutral-500 mt-1 break-all">
                  Si el botón no abrió Telegram, copia este enlace:{' '}
                  <a href={enlace} target="_blank" rel="noreferrer" className="text-navy-700 underline">{enlace}</a>
                </p>
              )}
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 w-5 h-5 rounded-full bg-navy-800 text-white text-[11px] font-bold flex items-center justify-center mt-2">3</span>
            <div className="flex-1">
              <button
                type="button"
                onClick={comprobarVinculacion}
                disabled={comprobando || bloqueado}
                className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm font-semibold text-navy-800 bg-white border-2 border-navy-800 rounded-lg hover:bg-navy-50 active:bg-navy-100 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
              >
                {comprobando ? `Comprobando${intentos ? ` (intento ${intentos + 1}/3)…` : '…'}` : 'Vincular cuenta'}
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
