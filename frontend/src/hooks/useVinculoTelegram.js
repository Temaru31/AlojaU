// Estado y acciones de la vinculación con Telegram (sin presentación).
// - Enlace firmado (deep link t.me) pedido al montar y refrescado antes de
//   expirar: el <a> ya tiene href válido cuando el usuario pulsa.
// - Sondeo suave tras abrir el bot (cada 3s, máx 3min): detecta la
//   verificación sin que el usuario pulse nada.
// - Comprobación manual con 3 reintentos (el webhook puede tardar en un
//   cold start) y desvinculación (libera chat y número).
// La confirmación es REAL: solo hay vínculo si el backend registró el chat.
import { useEffect, useRef, useState } from 'react'
import { notifyToast } from '../components/Toast'
import { desvincularTelegram, enlaceTelegram, obtenerPerfil } from '../services/cuentaApi'

export const TELEGRAM_POLL_MS = 3000
export const TELEGRAM_POLL_MAX = 60 // 3 min

/** 503 = bot sin configurar en el servidor (dev): se ofrece el modo local. */
export function esErrorSinBot(err) {
  return err?.response?.status === 503
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function useVinculoTelegram({
  token, vinculado, telefonoGuardado, onVinculado, onDesvinculado, alPedirEnlace,
}) {
  const [cargandoEnlace, setCargandoEnlace] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [error, setError] = useState('')
  const [botAbierto, setBotAbierto] = useState(false)
  const [enlace, setEnlace] = useState('')
  const [expiraSeg, setExpiraSeg] = useState(0)
  const [intentos, setIntentos] = useState(0)
  const [modoLocal, setModoLocal] = useState(false)
  const [confirmaDesvincular, setConfirmaDesvincular] = useState(false)
  const [desvinculando, setDesvinculando] = useState(false)

  // Guard de desmontaje: los reintentos duermen hasta 3s; sin esto habría
  // setState sobre componente desmontado al navegar en mitad del check.
  const vivoRef = useRef(true)
  useEffect(() => () => { vivoRef.current = false }, [])
  // Refs a los callbacks (inline en el padre): el polling no debe reiniciarse
  // en cada render por identidad nueva de la función.
  const onVinculadoRef = useRef(onVinculado)
  onVinculadoRef.current = onVinculado
  const alPedirEnlaceRef = useRef(alPedirEnlace)
  alPedirEnlaceRef.current = alPedirEnlace

  useEffect(() => {
    if (!botAbierto || vinculado) return undefined
    let cancelado = false
    const sondear = async () => {
      for (let i = 0; i < TELEGRAM_POLL_MAX; i += 1) {
        await sleep(TELEGRAM_POLL_MS)
        if (cancelado || !vivoRef.current) return
        try {
          const perfil = await obtenerPerfil(token)
          if (cancelado || !vivoRef.current) return
          if (perfil?.telegram_vinculado) {
            onVinculadoRef.current?.(true)
            notifyToast('¡Número verificado con éxito en AlojaU!')
            return
          }
        } catch {
          // Sigue sondeando hasta el tope (cold start de Render).
        }
      }
    }
    sondear()
    return () => { cancelado = true }
  }, [botAbierto, vinculado, token])

  const pedirEnlace = async (silencioso = false) => {
    if (!token || !telefonoGuardado || vinculado) return
    if (!silencioso) {
      setError('')
      setModoLocal(false)
      alPedirEnlaceRef.current?.()
      setCargandoEnlace(true)
    }
    try {
      const datos = await enlaceTelegram(token)
      const url = datos?.bot_url
      if (!url || !url.startsWith('https://t.me/')) {
        throw new Error('Respuesta inválida del bot')
      }
      if (!vivoRef.current) return
      setEnlace(url)
      setExpiraSeg(datos?.expira_segundos || 600)
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
      await desvincularTelegram(token)
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

  // Al pulsar el enlace (el <a> abre Telegram): arranca el sondeo desde cero.
  const abrirBot = () => {
    setError('')
    setBotAbierto(true)
    setIntentos(0)
  }

  const comprobarVinculacion = async () => {
    setComprobando(true)
    setError('')
    try {
      // El webhook de Telegram puede tardar unos segundos en
      // procesar el /start (cold start de Render). Reintenta con backoff
      // 3 intentos (~0s, 1s, 2s) antes de mostrar "no detectado".
      const delays = [0, 1000, 2000]
      for (let i = 0; i < delays.length; i += 1) {
        if (delays[i]) await sleep(delays[i])
        if (!vivoRef.current) return
        try {
          const perfil = await obtenerPerfil(token)
          if (!vivoRef.current) return
          if (perfil?.telegram_vinculado) {
            onVinculadoRef.current?.(true)
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

  return {
    enlace, cargandoEnlace, modoLocal, error, setError, pedirEnlace,
    botAbierto, abrirBot,
    comprobando, intentos, comprobarVinculacion,
    confirmaDesvincular, setConfirmaDesvincular, desvinculando, desvincular,
  }
}
