// ChatWidget — Asistente virtual AlojaU (MVP solo lectura).
// Flotante global (FAB + panel), perezoso vía React.lazy desde App.jsx.
// - Oculto en /admin/* (el MVP es para estudiantes/visitantes) y cuando
//   `chat_enabled` de /config-publica viene false (fail-closed en UI).
// - Respuestas como TEXTO PLANO (sin dangerouslySetInnerHTML ni Markdown).
// - Historial solo en estado local (nada de localStorage), tope 8 turnos.
// - POST sin reintento automático; 429/503 con mensaje claro y reintento manual.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle, Send, X } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { fetchConfigPublica, leerConfigCache } from '../constants'
import { formatCOP, formatDistancia } from '../utils/formatters'
import BadgeConfianza from './BadgeConfianza'
import { notifyToast } from './Toast'
import useFocusTrap from '../hooks/useFocusTrap'

const MENSAJE_BIENVENIDA = (
  'Hola, soy el asistente automático de AlojaU. Te ayudo a buscar vivienda '
  + 'cerca de tu campus y a usar la plataforma. Por tu seguridad, no me '
  + 'compartas documentos, claves ni datos bancarios.'
)
const MENSAJE_429 = (
  'Estoy recibiendo muchas consultas ahora mismo. Espera un momento e '
  + 'inténtalo de nuevo.'
)
const MENSAJE_ERROR = 'No pude responder ahora. Revisa tu conexión e inténtalo de nuevo.'

function ultimosTurnos(mensajes) {
  return mensajes
    .filter((m) => m.rol === 'user' || m.rol === 'assistant')
    .slice(-8)
    .map((m) => ({ rol: m.rol, texto: m.texto }))
}

function TarjetaChat({ tarjeta }) {
  return (
    <Link
      to={tarjeta.url}
      className="flex gap-2.5 p-2 rounded-xl border border-neutral-150 bg-white hover:border-navy-300 transition text-left"
    >
      {tarjeta.foto ? (
        <img
          src={tarjeta.foto}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="w-14 h-14 rounded-lg object-cover shrink-0 bg-neutral-100"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-navy-900 truncate">{tarjeta.titulo}</span>
        <span className="block text-xs text-neutral-600">
          {tarjeta.precio != null ? formatCOP(tarjeta.precio) : 'No informado'}
          {tarjeta.zona ? ` · ${tarjeta.zona}` : ''}
          {tarjeta.distancia_m != null ? ` · ${formatDistancia(tarjeta.distancia_m)}` : ''}
        </span>
        {tarjeta.indice_confianza != null ? (
          <span className="inline-block mt-1">
            <BadgeConfianza indice={tarjeta.indice_confianza} />
          </span>
        ) : null}
      </span>
    </Link>
  )
}

export default function ChatWidget() {
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [habilitado, setHabilitado] = useState(null) // null = verificando
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('idle') // idle|cargando|error|deshabilitado
  const cajaRef = useRef(null)
  const fabRef = useRef(null)
  const finRef = useRef(null)
  const ocupadoRef = useRef(false)
  useFocusTrap(cajaRef, abierto)

  useEffect(() => {
    if (!abierto) return
    const onKey = (e) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  useEffect(() => {
    let vivo = true
    const cache = (() => { try { return leerConfigCache() } catch { return null } })()
    if (cache && typeof cache.chat_enabled !== 'undefined') {
      setHabilitado(cache.chat_enabled === true)
      return () => { vivo = false }
    }
    fetchConfigPublica(() => api.get('/api/publicaciones/config-publica').then((r) => r.data))
      .then((cfg) => { if (vivo) setHabilitado(cfg?.chat_enabled === true) })
      .catch(() => { if (vivo) setHabilitado(false) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    try { finRef.current?.scrollIntoView?.({ block: 'nearest' }) } catch { /* jsdom */ }
  }, [mensajes, abierto])

  useEffect(() => {
    if (!abierto || mensajes.length > 0) return
    setMensajes([{ rol: 'assistant', texto: MENSAJE_BIENVENIDA }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  if (location.pathname.startsWith('/admin')) return null
  if (habilitado !== true) return null

  const enviar = async (reintento) => {
    const cuerpo = (reintento ?? texto).trim()
    if (!cuerpo || ocupadoRef.current) return
    ocupadoRef.current = true
    setEstado('cargando')
    setTexto('')
    const nuevos = [...mensajes, { rol: 'user', texto: cuerpo }]
    setMensajes(nuevos)
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const r = await api.post('/api/chat',
        { mensaje: cuerpo, historial: ultimosTurnos(nuevos) },
        headers ? { headers } : undefined)
      const data = r.data || {}
      if (data.deshabilitado) {
        setEstado('deshabilitado')
        setMensajes((m) => [...m, { rol: 'assistant', texto: data.respuesta || MENSAJE_ERROR }])
      } else {
        setEstado('idle')
        setMensajes((m) => [...m, {
          rol: 'assistant',
          texto: data.respuesta || MENSAJE_ERROR,
          tarjetas: Array.isArray(data.tarjetas) ? data.tarjetas.slice(0, 3) : [],
          acciones: Array.isArray(data.acciones_sugeridas)
            ? data.acciones_sugeridas.filter((a) => a && typeof a.ruta === 'string').slice(0, 5)
            : [],
        }])
      }
    } catch (err) {
      const codigo = err?.response?.status
      if (codigo === 429) {
        setEstado('idle')
        setMensajes((m) => [...m, { rol: 'assistant', texto: MENSAJE_429 }])
      } else {
        setEstado('error')
        notifyToast('El asistente no respondió. Inténtalo de nuevo.')
      }
    } finally {
      ocupadoRef.current = false
      fabRef.current?.focus?.()
    }
  }

  const cerrar = () => {
    setAbierto(false)
    fabRef.current?.focus?.()
  }

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar asistente AlojaU' : 'Abrir asistente AlojaU'}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="fixed bottom-4 right-4 z-[70] w-12 h-12 rounded-full bg-navy-800 text-white shadow-lg hover:bg-navy-700 active:scale-95 transition flex items-center justify-center"
      >
        {abierto
          ? <X aria-hidden="true" className="w-5 h-5" />
          : <MessageCircle aria-hidden="true" className="w-5 h-5" />}
      </button>
      {abierto && (
        <div
          ref={cajaRef}
          role="dialog"
          aria-label="Asistente virtual AlojaU"
          className="fixed bottom-[4.5rem] right-4 z-[70] w-[min(92vw,380px)] max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-neutral-150 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-navy-800 text-white shrink-0">
            <p className="text-sm font-bold">Asistente AlojaU</p>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar asistente"
              className="p-1.5 rounded-md hover:bg-white/10"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" aria-live="polite">
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.rol === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-navy-800 text-white px-3 py-2 text-sm'
                  : 'max-w-[92%] rounded-2xl rounded-bl-md bg-neutral-100 text-neutral-800 px-3 py-2 text-sm space-y-2'}>
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  {Array.isArray(m.tarjetas) && m.tarjetas.length > 0 && (
                    <div className="space-y-1.5">
                      {m.tarjetas.map((t) => <TarjetaChat key={t.id} tarjeta={t} />)}
                    </div>
                  )}
                  {Array.isArray(m.acciones) && m.acciones.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.acciones.map((a) => (
                        <button
                          key={a.ruta}
                          type="button"
                          onClick={() => { cerrar(); navigate(a.ruta) }}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-navy-300 text-navy-800 hover:bg-navy-50 min-h-[32px]"
                        >
                          {a.etiqueta}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {estado === 'cargando' && (
              <div className="flex justify-start" aria-label="El asistente está escribiendo">
                <div className="rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2.5" aria-hidden="true">
                  <span className="inline-block w-5 h-5 rounded-full border-2 border-navy-300 border-t-navy-800 animate-spin" />
                </div>
              </div>
            )}
            {estado === 'error' && (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                  <p>{MENSAJE_ERROR}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const ultimo = [...mensajes].reverse().find((m) => m.rol === 'user')
                      if (ultimo) enviar(ultimo.texto)
                    }}
                    className="mt-1.5 text-xs font-bold underline"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>
          <form
            className="flex items-center gap-2 p-2.5 border-t border-neutral-150 shrink-0"
            onSubmit={(e) => { e.preventDefault(); enviar() }}
          >
            <label htmlFor="chat-texto" className="sr-only">Escribe tu mensaje</label>
            <input
              id="chat-texto"
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregunta por zona, precio o tipo…"
              maxLength={500}
              autoComplete="off"
              className="input-field flex-1"
            />
            <button
              type="submit"
              disabled={!texto.trim() || estado === 'cargando'}
              aria-label="Enviar mensaje"
              className="w-10 h-10 rounded-full bg-navy-800 text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-navy-700 transition"
            >
              <Send aria-hidden="true" className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
