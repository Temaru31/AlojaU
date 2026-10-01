import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, conIdempotencia } from '../services/api'
import GoogleButton from '../components/GoogleButton'
import { signInWithGoogle, guardarRedirectPostLogin } from '../services/supabaseClient'
import UploadFotos from '../components/UploadFotos'
import MapPicker from '../components/MapPicker'
import ZonaSelect from '../components/ZonaSelect'
import { notifyToast } from '../components/Toast'
import { emitAuthChange, emitMiasChange, useAuth } from '../contexts/AuthContext'
import ContadorCaracteres from '../components/ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../constants'
import { esHttpUrl } from '../utils/urls'
import { SERVICIOS } from '../utils/servicios'
import InfoTooltip from '../components/InfoTooltip'
import useTiposVivienda from '../hooks/useTiposVivienda'
import { getEtiquetaTipo } from '../utils/tiposVivienda'

// ---------------------------------------------------------------------------
// Helpers exportados (testeables). Bloque 2 + Bloque 5.
// ---------------------------------------------------------------------------

/** Clave del borrador local (persistencia ante recargas / cold start). */
export const DRAFT_KEY = 'alojau_publicar_draft'

const ICONOS_SERVICIOS = {
  1: '📶',
  2: '🚿',
  3: '🍳',
  4: '🛋️',
  5: '🧺',
}

export function iconoServicio(id, nombre) {
  if (ICONOS_SERVICIOS[id]) return ICONOS_SERVICIOS[id]
  const n = String(nombre || '').toLowerCase()
  if (n.includes('wifi') || n.includes('internet')) return '📶'
  if (n.includes('baño')) return '🚿'
  if (n.includes('amobl')) return '🛋️'
  if (n.includes('cocina')) return '🍳'
  if (n.includes('lavad')) return '🧺'
  return '✨'
}

/**
 * Sanitización anti-XSS/SQLi en cliente (defensa en profundidad; el backend
 * rechaza `<`/`>` con 422 y usa ORM parametrizado). Elimina < > y recorta.
 */
export function sanitizarTexto(s, max = 2000) {
  if (s == null) return ''
  return String(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Formatea canon en tiempo real: 450000 -> "$ 450.000". */
export function formatearCOP(valor) {
  const n = Number(String(valor ?? '').replace(/[^\d]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return ''
  return `$ ${n.toLocaleString('es-CO')}`
}

/** Solo dígitos (para guardar en el payload). */
export function soloDigitos(valor) {
  return String(valor ?? '').replace(/[^\d]/g, '')
}

export function leerBorrador() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    return p
  } catch {
    return null
  }
}

export function guardarBorrador(form) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, _ts: Date.now() }))
  } catch { /* cuota llena: no rompe el form */ }
}

export function limpiarBorrador() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
}

/**
 * Valida el formulario de publicar contra LIMITES (fuente única de verdad).
 * @param {object} form Estado del formulario (mismas claves que Publicar).
 * @param {object} [lim=LIMITES] Límites inyectables (tests alteran el límite).
 * @returns {object} Mapa campo->mensaje (vacío = válido).
 */
export function validarPublicar(form, lim = LIMITES) {
  const e = {}
  const t = (form.titulo || '').trim()
  if (t.length < lim.titulo.min) e.titulo = `Mínimo ${lim.titulo.min} caracteres`
  else if ((form.titulo || '').length > lim.titulo.max) e.titulo = `Máximo ${lim.titulo.max} caracteres`
  const d = (form.descripcion || '').trim()
  if (d.length < lim.descripcion.min) e.descripcion = `Mínimo ${lim.descripcion.min} caracteres`
  else if ((form.descripcion || '').length > lim.descripcion.max) e.descripcion = `Máximo ${lim.descripcion.max} caracteres`
  if (!form.canon_mensual || Number(form.canon_mensual) <= 0) e.canon_mensual = 'Canon > 0'
  else if (Number(form.canon_mensual) > lim.canonMax) e.canon_mensual = `Máximo ${lim.canonMax / 1_000_000}M`
  if (form.deposito_requerido === '' || Number(form.deposito_requerido) < 0) e.deposito_requerido = 'Depósito >=0'
  const dir = (form.direccion_referencial || '').trim()
  if (dir.length < lim.direccion.min) e.direccion_referencial = `Mínimo ${lim.direccion.min} caracteres`
  else if ((form.direccion_referencial || '').length > lim.direccion.max) e.direccion_referencial = `Máximo ${lim.direccion.max} caracteres`
  const reg = (form.reglas_convivencia || '').trim()
  if (reg.length < lim.reglas.min) e.reglas_convivencia = `Mínimo ${lim.reglas.min} caracteres`
  else if ((form.reglas_convivencia || '').length > lim.reglas.max) e.reglas_convivencia = `Máximo ${lim.reglas.max} caracteres`
  if (!Array.isArray(form.servicios_ids) || form.servicios_ids.length === 0) e.servicios_ids = 'Selecciona al menos 1 servicio'
  // Zona del catálogo o barrio libre (mínimo uno).
  if (form.zona_barrio_id == null && !(form.barrio_texto || '').trim()) {
    e.zona = 'Elige tu barrio de la lista o escríbelo'
  }
  const fotosValid = (form.fotos || []).filter((f) => (f || '').trim() !== '')
  if (fotosValid.length < lim.fotosMin) e.fotos = `Mínimo ${lim.fotosMin} fotos (sube fotos reales)`
  else {
    for (const url of fotosValid) {
      // Validación estricta (CodeQL): protocolo http/https real, nunca
      // substring-match (aceptaba `http:evil` o `httpx://...`).
      if (!esHttpUrl(url)) { e.fotos = 'URLs deben ser http(s) válidas'; break }
    }
  }
  if (form.latitud !== '' && form.latitud != null && (isNaN(Number(form.latitud)) || Number(form.latitud) < -90 || Number(form.latitud) > 90)) e.latitud = 'Latitud entre -90 y 90'
  if (form.longitud !== '' && form.longitud != null && (isNaN(Number(form.longitud)) || Number(form.longitud) < -180 || Number(form.longitud) > 180)) e.longitud = 'Longitud entre -180 y 180'
  return e
}

// M2: selector dinámico (/config-publica con fallback local). Mantiene el
// contrato (value slug) y muestra tooltip por opción vía `title`.
export function SelectorTipoPublicar({ value, onChange, id = 'tipo-vivienda' }) {
  const { tipos } = useTiposVivienda()
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select-field"
      required
      aria-label="Tipo de vivienda"
    >
      {tipos.map((t) => (
        <option key={t.slug} value={t.slug} title={t.descripcion_tooltip || ''}>
          {t.icono ? `${t.icono} ` : ''}{t.nombre_visible || t.slug}
        </option>
      ))}
    </select>
  )
}

const FORM_INICIAL = {
  titulo: '',
  descripcion: '',
  tipo_inmueble: 'HABITACION_INDEPENDIENTE',
  canon_mensual: '',
  deposito_requerido: '0',
  zona_barrio_id: 3,
  barrio_texto: null,
  direccion_referencial: '',
  reglas_convivencia: '',
  latitud: '',
  longitud: '',
  servicios_ids: [1],
  campus_ids: [],
  // Sin fotos de ejemplo: el usuario sube las suyas (3-10) y el preview
  // muestra un placeholder hasta entonces. Las URLs de ejemplo (unsplash)
  // confundían y podían publicarse por accidente.
  fotos: [],
}

function mezclarBorrador(base, draft) {
  if (!draft) return base
  const out = { ...base }
  for (const k of Object.keys(base)) {
    if (draft[k] !== undefined) out[k] = draft[k]
  }
  // Higiene: borradores viejos podían traer fotos de ejemplo (unsplash);
  // se descartan para no publicar fotos ajenas por accidente.
  if (Array.isArray(out.fotos)) {
    out.fotos = out.fotos.filter((u) => u && !esFotoEjemplo(u))
  }
  return out
}

// Foto de ejemplo/placeholder: solo si el HOST parseado es de Unsplash
// (comparación exacta + sufijo, nunca subcadena: evita falsos positivos
// como https://evil.com/?x=images.unsplash.com). Sin esquema se asume
// https para el parseo (conserva el filtrado legacy de borradores viejos).
export function esFotoEjemplo(url) {
  try {
    const texto = String(url || '').trim()
    const normalizada = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`
    const host = new URL(normalizada).hostname.toLowerCase()
    return host === 'images.unsplash.com' || host.endsWith('.unsplash.com')
  } catch {
    return false
  }
}

export default function Publicar() {
  const { refresh } = useAuth()
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const [token, setToken] = useState(() => localStorage.getItem('alojau_token') || '')
  // M5: sin sesión se muestra auth unificado (Google + Mi Perfil), no form legacy.
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')

  const [form, setForm] = useState(() => mezclarBorrador(FORM_INICIAL, leerBorrador()))
  const [borradorRestaurado, setBorradorRestaurado] = useState(() => !!leerBorrador())
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitPhoneGate, setSubmitPhoneGate] = useState(false)
  const [submitOk, setSubmitOk] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [reintentando, setReintentando] = useState('')
  // Fotos seleccionadas en el dropzone pero aún sin subir (el hijo avisa
  // vía onPendientes). Sirve para guiar: "pulsa Subir antes de Enviar".
  const [fotosPendientes, setFotosPendientes] = useState(0)
  const enviandoRef = useRef(false)
  // Guard de desmontaje: no setState tras navegar en mitad del POST.
  const vivoRef = useRef(true)
  useEffect(() => () => { vivoRef.current = false }, [])

  // UX-AUDIT P0: igual que Perfil — el navbar puede cerrar sesión; re-sincroniza
  // el token local para no mostrar el formulario con un token muerto (401).
  useEffect(() => {
    const syncToken = () => {
      try { setToken(localStorage.getItem('alojau_token') || '') } catch { setToken('') }
    }
    window.addEventListener('alojau:auth-change', syncToken)
    window.addEventListener('storage', syncToken)
    return () => {
      window.removeEventListener('alojau:auth-change', syncToken)
      window.removeEventListener('storage', syncToken)
    }
  }, [])

  // Bloque 2: persistencia de borrador local (localStorage). Guarda mientras
  // escribe; sobrevive recargas y cold starts de Render sin perder progreso.
  useEffect(() => {
    if (!token) return
    const t = setTimeout(() => guardarBorrador(form), 300)
    return () => clearTimeout(t)
  }, [form, token])

  const descartarBorrador = () => {
    limpiarBorrador()
    setForm({ ...FORM_INICIAL })
    setBorradorRestaurado(false)
    setErrors({})
  }

  // M5: Google con retorno a /publicar tras el callback.
  const handleGoogle = async () => {
    setGoogleError('')
    setGoogleLoading(true)
    guardarRedirectPostLogin('/publicar')
    try {
      await signInWithGoogle()
    } catch (e) {
      setGoogleError(e?.message || 'Google OAuth no está configurado todavía.')
      setGoogleLoading(false)
    }
  }

  // (Sin botón de cerrar sesión aquí: la sesión se gestiona desde el menú
  // de usuario del navbar; en Publicar era ruido irrelevante.)

  const validate = () => {
    // Detalle #2: fuente única LIMITES (antes hardcodeaba 10/150/20/2000/10M
    // duplicando constants.js). El JSX ya usa LIMITES para maxLength.
    const e = validarPublicar(form)
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Anti-doble-clic: el ref cierra la carrera entre el click y el disabled.
    if (enviandoRef.current || submitting) return
    setSubmitError(''); setSubmitOk(null); setSubmitPhoneGate(false); setReintentando('')
    if (!validate()) {
      // Guía accionable: si hay fotos elegidas pero sin subir, el error de
      // "mínimo 3 fotos" confunde. Se explica el paso faltante.
      if (fotosPendientes > 0 && (form.fotos || []).filter(f => (f || '').trim() !== '').length < LIMITES.fotosMin) {
        setSubmitError(`Tienes ${fotosPendientes} foto(s) seleccionadas sin subir. En el paso 3 pulsa «Subir fotos» y luego «Enviar a revisión».`)
      }
      return
    }
    if (!token) {
      setSubmitError('Debes iniciar sesión como ARRENDADOR')
      return
    }
    enviandoRef.current = true
    setSubmitting(true)
    const fotosValid = form.fotos.filter(f => f.trim() !== '')
    // Bloque 2B: sanitización (defensa en profundidad; el backend valida con
    // Pydantic + rechaza HTML y usa ORM parametrizado).
    const payload = {
      titulo: sanitizarTexto(form.titulo, LIMITES.titulo.max),
      descripcion: sanitizarTexto(form.descripcion, LIMITES.descripcion.max),
      tipo_inmueble: form.tipo_inmueble,
      canon_mensual: Number(soloDigitos(form.canon_mensual) || form.canon_mensual),
      deposito_requerido: Number(soloDigitos(form.deposito_requerido) || 0),
      zona_barrio_id: form.zona_barrio_id != null ? Number(form.zona_barrio_id) : null,
      barrio_texto: sanitizarTexto(form.barrio_texto || '', 120) || null,
      direccion_referencial: sanitizarTexto(form.direccion_referencial, LIMITES.direccion.max),
      reglas_convivencia: sanitizarTexto(form.reglas_convivencia, LIMITES.reglas.max),
      latitud: form.latitud === '' ? null : Number(form.latitud),
      longitud: form.longitud === '' ? null : Number(form.longitud),
      servicios_ids: form.servicios_ids,
      campus_ids: [],
      fotos: fotosValid,
    }
    // Bloque 3: UNA sola capa de reintento (el interceptor de api.js ya
    // reintenta este POST idempotente 2 veces con 2s/4s ante cold start).
    // El borrador persiste hasta el éxito: si la red falla, nada se pierde.
    const idem = conIdempotencia({ headers: { Authorization: `Bearer ${token}` } })
    let exito = false
    try {
      // Bloque 2: clave única por clic; si el POST cae en timeout y axios
      // reintenta, el backend devuelve el replay (sin duplicar el aviso).
      const r = await api.post('/api/publicaciones', payload, idem)
      if (!vivoRef.current) return
      exito = true
      setSubmitOk(r.data)
      // Limpia borrador Y formulario: sin esto, el efecto de autoguardado
      // re-graba el draft justo después del éxito (resurrección).
      limpiarBorrador()
      setBorradorRestaurado(false)
      setForm({ ...FORM_INICIAL })
      setFotosPendientes(0)
      // El navbar muestra "Mis publicaciones" tras el primer aviso.
      emitMiasChange()
      // v13.2 reactividad de rol: si hubo promoción, re-sincroniza el perfil.
      if (r.data?.rol_actualizado) {
        try { await refresh?.() } catch { /* noop */ }
        emitAuthChange()
      }
    } catch (err) {
      if (!vivoRef.current) return
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setSubmitError(detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(' | '))
      } else if (typeof detail === 'string') {
        setSubmitError(detail)
        setSubmitPhoneGate(err.response?.status === 400)
      } else if (!err.response) {
        setSubmitError('El servidor está despertando (Render gratuito tarda hasta 50s). Tus datos quedaron guardados en el borrador: espera unos segundos y pulsa de nuevo «Enviar a revisión».')
      } else if (err.response?.status === 401) {
        setSubmitError('No autorizado. Verifica tu token ARRENDADOR.')
      } else if (err.response?.status === 403) {
        const d = typeof detail === 'string' ? detail : ''
        // v13: email sin confirmar o scope insuficiente.
        setSubmitError(d || 'Solo ARRENDADOR puede publicar (403). Si tu cuenta es de estudiante, se promueve sola al publicar; confirma tu correo en Mi Perfil si se solicita.')
      } else {
        setSubmitError(err.message || 'Error al publicar')
      }
    } finally {
      setSubmitting(false)
      enviandoRef.current = false
      if (!exito) setReintentando('')
    }
  }

  const toggleArray = (field, id) => {
    setForm(f => {
      const arr = f[field]
      return { ...f, [field]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
    })
  }

  const hacerPortada = (idx) => {
    setForm(f => {
      const fotos = [...(f.fotos || [])]
      if (idx <= 0 || idx >= fotos.length) return f
      const [cover] = fotos.splice(idx, 1)
      return { ...f, fotos: [cover, ...fotos] }
    })
  }

  const quitarFotoUrl = (idx) => {
    setForm(f => ({ ...f, fotos: (f.fotos || []).filter((_, i) => i !== idx) }))
  }

  // Live Preview (estilo Airbnb / misma data que Buscar Card).
  const preview = useMemo(() => {
    const fotosValid = (form.fotos || []).filter(f => (f || '').trim() !== '')
    const canonNum = Number(soloDigitos(form.canon_mensual) || form.canon_mensual || 0)
    return {
      titulo: form.titulo.trim() || 'Tu título aparecerá aquí',
      canon: canonNum > 0 ? `$${canonNum.toLocaleString('es-CO')} COP/mes` : 'Canon por definir',
      tipo: getEtiquetaTipo(form.tipo_inmueble, tiposCatalogo, form.tipo_inmueble),
      foto: fotosValid[0] || null,
      numFotos: fotosValid.length,
      servicios: (form.servicios_ids || []).length,
      tieneUbi: form.latitud !== '' && form.longitud !== '',
    }
  }, [form, tiposCatalogo])

  const canonFormateado = formatearCOP(form.canon_mensual)
  const depositoFormateado = formatearCOP(form.deposito_requerido)

  if (!token) {
    return (
      <div className="container-main py-8 md:py-12 min-h-dvh">
        <div className="max-w-2xl mx-auto">
          <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Publicar</span>
          </nav>

          <div className="card p-6 md:p-8">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
              Publicar vivienda
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              Debes iniciar sesión para publicar. Al publicar, tu cuenta se activa como arrendador y tu anuncio entra en revisión antes de ser visible.
            </p>

            <GoogleButton loading={googleLoading} onClick={handleGoogle} />
            {googleError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2 mt-3" role="alert">{googleError}</p>}
            <div className="flex items-center gap-3 my-4" aria-hidden="true">
              <span className="flex-1 h-px bg-neutral-200" />
              <span className="text-[11px] text-neutral-400">o</span>
              <span className="flex-1 h-px bg-neutral-200" />
            </div>
            <Link to="/perfil" className="btn-secondary w-full justify-center">
              Entrar con correo en Mi Perfil
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Publicar</span>
          </nav>

          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-0">
              Publicar vivienda
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Publicar es gratis y toma menos de 2 minutos. Revisamos tu anuncio antes de mostrarlo en el catálogo.
          </p>
          {borradorRestaurado && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-navy-50 border border-navy-100 px-3 py-2">
              <p className="text-xs text-navy-800">📝 Borrador restaurado: seguiste donde ibas.</p>
              <button type="button" onClick={descartarBorrador} className="text-xs font-semibold text-neutral-500 hover:text-red-600 underline shrink-0">Descartar</button>
            </div>
          )}
        </div>

        {submitOk && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="font-semibold text-emerald-800">¡Publicación enviada! Está en revisión y te avisaremos cuando sea visible.</p>
            </div>
            {submitOk.rol_actualizado && (
              <p className="text-sm text-emerald-700 mt-1">🎉 Tu cuenta ahora es <b>Arrendador</b>: ya puedes ver tu panel en Mis publicaciones.</p>
            )}
            <p className="text-sm text-emerald-700 mt-1">{submitOk.mensaje || ''}</p>
            {submitOk.indice_confianza != null && (
              <p className="text-xs text-emerald-600 mt-2">Índice confianza: <b>{submitOk.indice_confianza}</b> — {submitOk.advertencia}</p>
            )}
            <p className="text-xs text-emerald-500 mt-2">Referencia #{submitOk.id} — Tu anuncio aparecerá en el catálogo cuando sea aprobado.</p>
          </div>
        )}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4" role="alert">
            <p className="text-red-700 text-sm break-words">{submitError}</p>
            {submitPhoneGate && (
              <Link to="/perfil#datos" className="inline-block mt-2 text-xs font-semibold text-navy-700 underline hover:text-navy-900">
                Vincular mi número en Mi Perfil → Datos y contacto
              </Link>
            )}
          </div>
        )}
        {reintentando && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4" role="status">
            <p className="text-xs text-amber-800">{reintentando}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
          <form onSubmit={handleSubmit} className="space-y-5 min-w-0" noValidate>
            {/* PASO 1: Información principal */}
            <section aria-labelledby="paso1" className="card p-6 md:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
                <div>
                  <h2 id="paso1" className="font-semibold text-navy-900">Información principal</h2>
                  <p className="text-xs text-neutral-400">Título, tipo y precio. El precio se formatea solo.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Titulo de la publicacion * <span className="text-neutral-400 font-normal">(10-150)</span></label>
                <div className="relative">
                  <input
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Habitacion amoblada cerca al Tulcan"
                    maxLength={LIMITES.titulo.max}
                    aria-describedby="titulo-contador"
                    className={`input-field ${errors.titulo ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.titulo.trim().length, LIMITES.titulo.min, LIMITES.titulo.max)]}`}
                    required
                  />
                  <ContadorCaracteres id="titulo-contador" len={form.titulo.trim().length} min={LIMITES.titulo.min} max={LIMITES.titulo.max} />
                </div>
                {errors.titulo && <p className="text-xs text-red-600 mt-1">{errors.titulo}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Descripcion * <span className="text-neutral-400 font-normal">(20-2000)</span></label>
                <div className="relative">
                  <textarea
                    value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion: e.target.value })}
                    rows={3}
                    placeholder="Amoblada, baño privado, WiFi 200MB, cerca universidad..."
                    maxLength={LIMITES.descripcion.max}
                    aria-describedby="descripcion-contador"
                    className={`input-field resize-none ${errors.descripcion ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.descripcion.trim().length, LIMITES.descripcion.min, LIMITES.descripcion.max)]}`}
                  />
                  <ContadorCaracteres id="descripcion-contador" len={form.descripcion.trim().length} min={LIMITES.descripcion.min} max={LIMITES.descripcion.max} />
                </div>
                {errors.descripcion && <p className="text-xs text-red-600 mt-1">{errors.descripcion}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    Tipo de vivienda *
                    <InfoTooltip texto="Elige el tipo que mejor describe tu aviso. Pasa el cursor por cada opción para ver su descripción." />
                  </span>
                </label>
                <SelectorTipoPublicar value={form.tipo_inmueble} onChange={(v) => setForm({ ...form, tipo_inmueble: v })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-1.5">Canon mensual (COP) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.canon_mensual}
                    onChange={e => setForm({ ...form, canon_mensual: soloDigitos(e.target.value).slice(0, 8) })}
                    placeholder="450000"
                    className={`input-field ${errors.canon_mensual ? '!border-red-300 !shadow-none' : ''}`}
                    required
                  />
                  {canonFormateado ? (
                    <p className="text-xs text-emerald-700 font-semibold mt-1" aria-live="polite">{canonFormateado} COP/mes</p>
                  ) : (
                    <p className="text-[11px] text-neutral-400 mt-1">Escribe solo números, lo formateamos por ti.</p>
                  )}
                  {errors.canon_mensual && <p className="text-xs text-red-600 mt-1">{errors.canon_mensual}</p>}
                  {!errors.canon_mensual && form.canon_mensual !== '' && Number(form.canon_mensual) > 0 && Number(form.canon_mensual) < 100000 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-1.5" role="status">
                      ¿El precio es correcto? Recuerda ingresar el monto total mensual.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-1.5">Deposito (0 si no aplica)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.deposito_requerido}
                    onChange={e => setForm({ ...form, deposito_requerido: soloDigitos(e.target.value).slice(0, 8) })}
                    placeholder="0"
                    className={`input-field ${errors.deposito_requerido ? '!border-red-300 !shadow-none' : ''}`}
                  />
                  {depositoFormateado && Number(form.deposito_requerido) > 0 && (
                    <p className="text-xs text-neutral-500 mt-1" aria-live="polite">{depositoFormateado}</p>
                  )}
                  {errors.deposito_requerido && <p className="text-xs text-red-600 mt-1">{errors.deposito_requerido}</p>}
                </div>
              </div>
            </section>

            {/* PASO 2: Ubicación & Mapa */}
            <section aria-labelledby="paso2" className="card p-6 md:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
                <div>
                  <h2 id="paso2" className="font-semibold text-navy-900">Ubicación &amp; mapa</h2>
                  <p className="text-xs text-neutral-400">Barrio + punto en Popayán. Las distancias se calculan solas.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="zona-barrio">Zona / barrio *</label>
                <ZonaSelect
                  value={{ zona_barrio_id: form.zona_barrio_id, barrio_texto: form.barrio_texto }}
                  onChange={(z) => setForm({ ...form, zona_barrio_id: z.zona_barrio_id, barrio_texto: z.barrio_texto })}
                  inputId="zona-barrio"
                  error={errors.zona}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Direccion referencial *</label>
                <div className="relative">
                  <input
                    value={form.direccion_referencial}
                    onChange={e => setForm({ ...form, direccion_referencial: e.target.value })}
                    placeholder="No compartas tu direccion exacta"
                    maxLength={LIMITES.direccion.max}
                    aria-describedby="direccion-contador"
                    className={`input-field ${errors.direccion_referencial ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.direccion_referencial.trim().length, LIMITES.direccion.min, LIMITES.direccion.max)]}`}
                    required
                  />
                  <ContadorCaracteres id="direccion-contador" len={form.direccion_referencial.trim().length} min={LIMITES.direccion.min} max={LIMITES.direccion.max} />
                </div>
                {errors.direccion_referencial && <p className="text-xs text-red-600 mt-1">{errors.direccion_referencial}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Ubicación en mapa <span className="text-neutral-400 font-normal">(opcional, guarda coords directo)</span></label>
                <p className="text-[11px] text-neutral-400 mb-2">Ubicación de referencia en mapa detectada. Si el nombre del sector no coincide exactamente, selecciona o escribe el nombre correcto de tu barrio abajo.</p>
                <MapPicker
                  lat={form.latitud}
                  lng={form.longitud}
                  onChange={(nuevaLat, nuevaLng) => setForm(f => ({ ...f, latitud: nuevaLat, longitud: nuevaLng }))}
                  onAddressSuggestion={(dir) => setForm(f => ({
                    ...f,
                    direccion_referencial: f.direccion_referencial.trim().length >= 10 ? f.direccion_referencial : String(dir || '').slice(0, 200),
                  }))}
                  onGeoError={(msg) => notifyToast(msg)}
                />
              </div>

              {/* Coords vinculadas al mapa, sin cajas numéricas visibles. */}
              <div aria-live="polite">
                {form.latitud !== '' && form.longitud !== '' ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <p className="text-xs text-emerald-800">
                      📍 Ubicación confirmada: <b>{form.latitud}, {form.longitud}</b>
                    </p>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, latitud: '', longitud: '' }))}
                      className="text-xs font-medium text-emerald-700 hover:text-red-600 hover:underline shrink-0"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">
                    Sin ubicación marcada: usa el mapa de arriba para fijar el punto (opcional).
                  </p>
                )}
                {(errors.latitud || errors.longitud) && (
                  <p className="text-xs text-red-600 mt-1">{errors.latitud || errors.longitud}</p>
                )}
              </div>
              <p className="text-xs text-neutral-500 bg-navy-50 border border-navy-100 rounded-lg px-3 py-2">
                📍 Las distancias a Tulcán, Torobajo, Centro y demás puntos se calculan solas con la ubicación que marques en el mapa.
              </p>
            </section>

            {/* PASO 3: Servicios, reglas y fotos */}
            <section aria-labelledby="paso3" className="card p-6 md:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">3</span>
                <div>
                  <h2 id="paso3" className="font-semibold text-navy-900">Servicios, reglas y fotos</h2>
                  <p className="text-xs text-neutral-400">Toca para elegir. La primera foto es la portada.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Servicios *</label>
                <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Servicios">
                  {SERVICIOS.map(s => (
                    <label key={s.id} className={`text-xs sm:text-sm px-3 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-full border cursor-pointer select-none transition active:scale-[0.97] ${form.servicios_ids.includes(s.id) ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'}`}>
                      <input type="checkbox" className="sr-only" checked={form.servicios_ids.includes(s.id)} onChange={() => toggleArray('servicios_ids', s.id)} />
                      <span aria-hidden="true">{iconoServicio(s.id, s.nombre)}</span>
                      {s.nombre}
                    </label>
                  ))}
                </div>
                {errors.servicios_ids && <p className="text-xs text-red-600 mt-1">{errors.servicios_ids}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Reglas de convivencia *</label>
                <div className="relative">
                  <textarea
                    value={form.reglas_convivencia}
                    onChange={e => setForm({ ...form, reglas_convivencia: e.target.value })}
                    placeholder="Describe las reglas de convivencia..."
                    rows={3}
                    maxLength={LIMITES.reglas.max}
                    aria-describedby="reglas-contador"
                    className={`input-field resize-none ${errors.reglas_convivencia ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.reglas_convivencia.trim().length, LIMITES.reglas.min, LIMITES.reglas.max)]}`}
                  />
                  <ContadorCaracteres id="reglas-contador" len={form.reglas_convivencia.trim().length} min={LIMITES.reglas.min} max={LIMITES.reglas.max} />
                </div>
                {errors.reglas_convivencia && <p className="text-xs text-red-600 mt-1">{errors.reglas_convivencia}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Fotos * <span className="text-neutral-400 font-normal">(3 a 10 fotos tuyas)</span></label>
                {/* El vaciado del uploader debe vaciar el formulario (respetar Limpiar). */}
                <UploadFotos token={token} initialUrls={form.fotos} onUrls={(urls) => setForm(f => ({ ...f, fotos: urls }))} onPendientes={setFotosPendientes} />
                {errors.fotos && <p className="text-xs text-red-600 mt-1">{errors.fotos}</p>}
                {/* Selector de portada: la primera es la que se ve en Buscar. */}
                {(form.fotos || []).filter(f => (f || '').trim() !== '').length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-navy-800 mb-2">Elige la portada (se muestra en Buscar):</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {(form.fotos || []).filter(f => (f || '').trim() !== '').map((url, idx) => (
                        <div key={url} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${idx === 0 ? 'border-gold-400' : 'border-neutral-200'}`}>
                          <img src={url} alt={idx === 0 ? `Portada principal ${idx + 1}` : `Foto ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                          {idx === 0 ? (
                            <span className="absolute top-1 left-1 bg-gold-400 text-navy-900 text-[10px] font-bold px-1.5 py-0.5 rounded">★ Portada</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => hacerPortada(idx)}
                              aria-label={`Hacer portada la foto ${idx + 1}`}
                              className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-1 rounded hover:bg-navy-800"
                            >
                              Hacer portada
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => quitarFotoUrl(idx)}
                            aria-label={`Quitar foto ${idx + 1}`}
                            className="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-red-600 before:absolute before:-inset-2.5 before:content-['']"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-neutral-400 mt-2">Tip iPhone: si tu foto sale como .HEIC, cámbiala a JPG en Ajustes → Cámara → Formatos → Más compatible.</p>
              </div>
            </section>

            <div className="pt-2 card p-6 md:p-8">
              <button type="submit" disabled={submitting} aria-disabled={submitting} className="btn-accent w-full justify-center disabled:opacity-60 disabled:cursor-wait min-h-[48px]">
                {submitting
                  ? (<span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Guardando publicación...</span>)
                  : 'Enviar a revision'}
              </button>
              <p className="text-xs text-neutral-400 text-center mt-3">
                Al publicar, tu cuenta se activa como arrendador. Revisamos tu anuncio antes de mostrarlo en el catálogo.
              </p>
            </div>
          </form>

          {/* Live Preview sticky (Airbnb-style) */}
          <aside aria-label="Vista previa en vivo" className="lg:sticky lg:top-20">
            <div className="card overflow-hidden">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 px-4 pt-3">Vista previa en vivo</p>
              <div className="p-4">
                <div className="rounded-xl overflow-hidden bg-neutral-100 aspect-[4/3] relative">
                  {preview.foto ? (
                    <img src={preview.foto} alt="Portada del anuncio" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300 text-4xl" role="img" aria-label="Sin foto">⌂</div>
                  )}
                  <span className="absolute top-2 left-2 bg-white/90 text-navy-900 text-[10px] font-bold px-2 py-1 rounded-full">{preview.tipo}</span>
                </div>
                <p className="font-semibold text-navy-900 text-sm mt-3 line-clamp-2">{preview.titulo}</p>
                <p className="text-sm font-bold text-navy-800 mt-1">{preview.canon}</p>
                <p className="text-[11px] text-neutral-500 mt-1">{preview.numFotos} fotos · {preview.servicios} servicios{preview.tieneUbi ? ' · 📍 con ubicación' : ''}</p>
                <p className="text-[11px] text-neutral-400 mt-2">Así se verá tu tarjeta en Buscar. La primera foto es la portada.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
