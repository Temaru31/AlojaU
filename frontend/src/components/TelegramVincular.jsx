// TelegramVincular — M5 vinculación $0.
// El enlace "Abrir Bot en Telegram" es un <a> nativo con el `bot_url`
// pre-generado del endpoint GET /api/auth/telegram/enlace (token HMAC
// 1 uso, 10min): ningún bloqueador lo intercepta (cero window.open).
// Modo local: si el backend responde 503 (bot sin configurar en dev), se
// ofrece una simulación de interfaz claramente etiquetada que NUNCA marca la
// cuenta como vinculada (solo demuestra el flujo visual del PIN de 6).
// Uso: <TelegramVincular token={token} vinculado={perfil?.telegram_vinculado} />
import { useState } from 'react'
import { Check } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import useVinculoTelegram from '../hooks/useVinculoTelegram'

// Guía en 3 pasos: 1) abrir el bot 2) pulsar /start en Telegram 3) compartir
// el contacto NATIVO, que marca telefono_verificado=true en BD (sin SMS de
// pago). El botón es un <a> nativo con target=_blank al deep link firmado:
// ningún bloqueador lo intercepta (cero window.open/about:blank).
// Uso: <TelegramVincular token vinculado onVinculado telefonoGuardado telefonoVerificado />
export default function TelegramVincular({
  token, vinculado, onVinculado, onDesvinculado,
  telefonoGuardado = true, telefonoVerificado = false,
}) {
  // Simulación de interfaz (solo dev y sin bot): nunca toca el backend.
  const [pinSim, setPinSim] = useState('')
  const [pinOk, setPinOk] = useState(false)
  const {
    enlace, cargandoEnlace, modoLocal, error, setError, pedirEnlace,
    setBotAbierto, comprobando, intentos, comprobarVinculacion,
    confirmaDesvincular, setConfirmaDesvincular, desvinculando, desvincular,
  } = useVinculoTelegram({
    token, vinculado, telefonoGuardado, onVinculado, onDesvinculado,
    alPedirEnlace: () => { setPinSim(''); setPinOk(false) },
  })

  const probarPinSimulado = (e) => {
    e?.preventDefault()
    // Acepta cualquier PIN de 6 dígitos solo para mostrar el estado visual.
    if (/^[0-9]{6}$/.test(pinSim)) setPinOk(true)
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
              <Check aria-hidden="true" className="w-3.5 h-3.5" /> Teléfono y Telegram Verificados (+20 pts)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <Check aria-hidden="true" className="w-3.5 h-3.5" /> Vinculado
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
                luego comparte tu número con Compartir mi número de teléfono para verificar para confirmar que la cuenta es tuya (debe ser el guardado en tu perfil).
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
            <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5" role="status">
              <Check aria-hidden="true" className="w-3.5 h-3.5" /> Flujo simulado correcto (en producción el bot confirmaría aquí).
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
