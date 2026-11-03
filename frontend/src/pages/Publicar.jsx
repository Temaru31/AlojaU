import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, conIdempotencia } from '../services/api'
import GoogleButton from '../components/GoogleButton'
import { signInWithGoogle, guardarRedirectPostLogin } from '../services/supabaseClient'
import { emitAuthChange, emitMiasChange, useAuth } from '../contexts/AuthContext'
import { LIMITES } from '../constants'
import useTiposVivienda from '../hooks/useTiposVivienda'
import { getEtiquetaTipo } from '../utils/tiposVivienda'
import { ArrowRight, FileText, House, MapPin } from 'lucide-react'
import { authHead } from '../services/authHeaders'
import { leerToken } from '../services/tokenStorage'
import PasoInformacion from './publicar/PasoInformacion'
import PasoUbicacion from './publicar/PasoUbicacion'
import PasoServiciosFotos from './publicar/PasoServiciosFotos'
import { sanitizarTexto, formatearCOP, soloDigitos, leerBorrador, guardarBorrador, limpiarBorrador, validarPublicar, FORM_INICIAL, mezclarBorrador } from '../utils/publicar'

// ---------------------------------------------------------------------------
// Helpers exportados (testeables). Bloque 2 + Bloque 5.
// ---------------------------------------------------------------------------

export default function Publicar() {
  const { refresh } = useAuth()
  const { tipos: tiposCatalogo } = useTiposVivienda()
  const [token, setToken] = useState(() => leerToken())
  // Sin sesión se muestra auth unificado (Google + Mi Perfil), no form legacy.
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

  // Igual que Perfil — el navbar puede cerrar sesión; re-sincroniza
  // el token local para no mostrar el formulario con un token muerto (401).
  useEffect(() => {
    const syncToken = () => {
      setToken(leerToken())
    }
    window.addEventListener('alojau:auth-change', syncToken)
    window.addEventListener('storage', syncToken)
    return () => {
      window.removeEventListener('alojau:auth-change', syncToken)
      window.removeEventListener('storage', syncToken)
    }
  }, [])

  // Persistencia de borrador local (localStorage). Guarda mientras
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

  // Google con retorno a /publicar tras el callback.
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
    // Fuente única LIMITES (antes hardcodeaba 10/150/20/2000/10M
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
    // UNA sola capa de reintento (el interceptor de api.js ya
    // reintenta este POST idempotente 2 veces con 2s/4s ante cold start).
    // El borrador persiste hasta el éxito: si la red falla, nada se pierde.
    const idem = conIdempotencia(authHead(token))
    let exito = false
    try {
      // Clave única por clic; si el POST cae en timeout y axios
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
      // Reactividad de rol: si hubo promoción, re-sincroniza el perfil.
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
        // Email sin confirmar o scope insuficiente.
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
              <p className="text-xs text-navy-800 flex items-center gap-1.5"><FileText aria-hidden="true" className="w-4 h-4" /> Borrador restaurado: seguiste donde ibas.</p>
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
              <p className="text-sm text-emerald-700 mt-1">Tu cuenta ahora es <b>Arrendador</b>: ya puedes ver tu panel en Mis publicaciones.</p>
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
                Vincular mi número en Mi Perfil <ArrowRight aria-hidden="true" className="w-4 h-4 inline" /> Datos y contacto
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
            <PasoInformacion form={form} setForm={setForm} errors={errors} canonFormateado={canonFormateado} depositoFormateado={depositoFormateado} />

            {/* PASO 2: Ubicación & Mapa */}
            <PasoUbicacion form={form} setForm={setForm} errors={errors} />

            {/* PASO 3: Servicios, reglas y fotos */}
            <PasoServiciosFotos form={form} setForm={setForm} errors={errors} token={token} toggleArray={toggleArray} hacerPortada={hacerPortada} quitarFotoUrl={quitarFotoUrl} setFotosPendientes={setFotosPendientes} />

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
                    <div className="w-full h-full flex items-center justify-center text-neutral-300" role="img" aria-label="Sin foto"><House aria-hidden="true" className="w-10 h-10" /></div>
                  )}
                  <span className="absolute top-2 left-2 bg-white/90 text-navy-900 text-[10px] font-bold px-2 py-1 rounded-full">{preview.tipo}</span>
                </div>
                <p className="font-semibold text-navy-900 text-sm mt-3 line-clamp-2">{preview.titulo}</p>
                <p className="text-sm font-bold text-navy-800 mt-1">{preview.canon}</p>
                <p className="text-[11px] text-neutral-500 mt-1">{preview.numFotos} fotos · {preview.servicios} servicios{preview.tieneUbi ? (<> · <MapPin aria-hidden="true" className="w-3 h-3 inline" /> con ubicación</>) : ''}</p>
                <p className="text-[11px] text-neutral-400 mt-2">Así se verá tu tarjeta en Buscar. La primera foto es la portada.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
