import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import UploadFotos from '../components/UploadFotos'
import MapPicker from '../components/MapPicker'
import ZonaSelect from '../components/ZonaSelect'
import { notifyToast } from '../components/Toast'
import { emitAuthChange, useAuth } from '../contexts/AuthContext'
import ContadorCaracteres from '../components/ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../constants'

const SERVICIOS = [
  { id: 1, nombre: 'WiFi Fibra' },
  { id: 2, nombre: 'Baño Privado' },
  { id: 3, nombre: 'Cocina Compartida' },
  { id: 4, nombre: 'Amoblado' },
  { id: 5, nombre: 'Lavadora' },
]

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
  // Tarea 3 (v10): zona del catálogo o barrio libre (mínimo uno).
  if (form.zona_barrio_id == null && !(form.barrio_texto || '').trim()) {
    e.zona = 'Elige tu barrio de la lista o escríbelo'
  }
  const fotosValid = (form.fotos || []).filter((f) => (f || '').trim() !== '')
  if (fotosValid.length < lim.fotosMin) e.fotos = `Mínimo ${lim.fotosMin} fotos (URLs válidas)`
  else {
    for (const url of fotosValid) {
      try { new URL(url); if (!url.startsWith('http')) throw new Error() } catch { e.fotos = 'URLs deben ser http(s) válidas'; break }
    }
  }
  if (form.latitud !== '' && form.latitud != null && (isNaN(Number(form.latitud)) || Number(form.latitud) < -90 || Number(form.latitud) > 90)) e.latitud = 'Latitud entre -90 y 90'
  if (form.longitud !== '' && form.longitud != null && (isNaN(Number(form.longitud)) || Number(form.longitud) < -180 || Number(form.longitud) > 180)) e.longitud = 'Longitud entre -180 y 180'
  return e
}

export default function Publicar() {
  const { refresh } = useAuth()
  const [token, setToken] = useState(() => localStorage.getItem('alojau_token') || '')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [form, setForm] = useState({
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
    fotos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1493809842364-78817add58d1?auto=format&fit=crop&w=800&q=80'],
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitPhoneGate, setSubmitPhoneGate] = useState(false)
  const [submitOk, setSubmitOk] = useState(null)
  const [submitting, setSubmitting] = useState(false)

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

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError(''); setLoginLoading(true)
    try {
      const r = await api.post('/api/auth/login', { email: loginEmail, password: loginPass })
      const t = r.data.access_token
      localStorage.setItem('alojau_token', t)
      setToken(t)
      emitAuthChange()
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Credenciales inválidas')
    } finally { setLoginLoading(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem('alojau_token')
    setToken('')
    emitAuthChange()
  }

  const validate = () => {
    // Detalle #2: fuente única LIMITES (antes hardcodeaba 10/150/20/2000/10M
    // duplicando constants.js). El JSX ya usa LIMITES para maxLength.
    const e = validarPublicar(form)
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(''); setSubmitOk(null); setSubmitPhoneGate(false)
    if (!validate()) return
    if (!token) {
      setSubmitError('Debes iniciar sesión como ARRENDADOR')
      return
    }
    setSubmitting(true)
    const fotosValid = form.fotos.filter(f => f.trim() !== '')
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      tipo_inmueble: form.tipo_inmueble,
      canon_mensual: Number(form.canon_mensual),
      deposito_requerido: Number(form.deposito_requerido),
      zona_barrio_id: form.zona_barrio_id != null ? Number(form.zona_barrio_id) : null,
      barrio_texto: (form.barrio_texto || '').trim() || null,
      direccion_referencial: form.direccion_referencial.trim(),
      reglas_convivencia: form.reglas_convivencia.trim(),
      latitud: form.latitud === '' ? null : Number(form.latitud),
      longitud: form.longitud === '' ? null : Number(form.longitud),
      servicios_ids: form.servicios_ids,
      campus_ids: [],
      fotos: fotosValid,
    }
    try {
      const r = await api.post('/api/publicaciones', payload, { headers: { Authorization: `Bearer ${token}` } })
      setSubmitOk(r.data)
      // v13.2 reactividad de rol: si hubo promoción, re-sincroniza el perfil.
      if (r.data?.rol_actualizado) {
        try { await refresh?.() } catch { /* noop */ }
        emitAuthChange()
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setSubmitError(detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(' | '))
      } else if (typeof detail === 'string') {
        setSubmitError(detail)
        setSubmitPhoneGate(err.response?.status === 400)
      } else if (err.response?.status === 401) {
        setSubmitError('No autorizado. Verifica tu token ARRENDADOR.')
      } else if (err.response?.status === 403) {
        const d = typeof detail === 'string' ? detail : ''
        // v13: email sin confirmar o scope insuficiente.
        setSubmitError(d || 'Solo ARRENDADOR puede publicar (403). Si tu cuenta es de estudiante, se promueve sola al publicar; confirma tu correo en Mi Perfil si se solicita.')
      } else {
        setSubmitError(err.message || 'Error al publicar')
      }
    } finally { setSubmitting(false) }
  }

  const toggleArray = (field, id) => {
    setForm(f => {
      const arr = f[field]
      return { ...f, [field]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
    })
  }

  if (!token) {
    return (
      <div className="container-main py-8 md:py-12">
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
              Debes iniciar sesión como <b>ARRENDADOR</b> para publicar. Estado inicial siempre <span className="font-medium text-gold-600">PENDIENTE</span> hasta ser revisada.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              {loginError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{loginError}</p>}
              <button type="submit" disabled={loginLoading} className="btn-accent w-full justify-center">
                {loginLoading ? 'Ingresando...' : 'Iniciar sesión como ARRENDADOR'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-2xl mx-auto">
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
            <button type="button" onClick={handleLogout} className="text-xs sm:text-sm text-neutral-500 hover:text-red-600">Cerrar sesión</button>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Publicar es gratis y toma menos de 2 minutos. Tu anuncio estará visible tan pronto confirmes la ubicación en el mapa.
          </p>
        </div>

        {submitOk && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="font-semibold text-emerald-800">¡Publicación creada! Estado: {submitOk.estado}</p>
            </div>
            {submitOk.rol_actualizado && (
              <p className="text-sm text-emerald-700 mt-1">🎉 Tu cuenta ahora es <b>Arrendador</b>: tu panel se actualizó solo.</p>
            )}
            <p className="text-sm text-emerald-700 mt-1">{submitOk.mensaje || ''}</p>
            {submitOk.indice_confianza != null && (
              <p className="text-xs text-emerald-600 mt-2">Índice confianza: <b>{submitOk.indice_confianza}</b> — {submitOk.advertencia}</p>
            )}
            <p className="text-xs text-emerald-500 mt-2">ID {submitOk.id} — No aparece en catálogo hasta ser aprobada.</p>
          </div>
        )}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-700 text-sm break-words">{submitError}</p>
            {submitPhoneGate && (
              <Link to="/perfil#datos" className="inline-block mt-2 text-xs font-semibold text-navy-700 underline hover:text-navy-900">
                Vincular mi número en Mi Perfil → Datos y contacto
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 md:p-8 space-y-5" noValidate>
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
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Tipo de vivienda *</label>
            <select
              value={form.tipo_inmueble}
              onChange={e => setForm({ ...form, tipo_inmueble: e.target.value })}
              className="select-field"
              required
            >
              <option value="HABITACION_FAMILIAR">Habitacion familiar</option>
              <option value="HABITACION_INDEPENDIENTE">Habitacion independiente</option>
              <option value="APARTAESTUDIO">Apartaestudio</option>
              <option value="COMPARTIDO">Compartido</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Canon mensual (COP) *</label>
              <input
                type="number"
                value={form.canon_mensual}
                onChange={e => setForm({ ...form, canon_mensual: e.target.value })}
                placeholder="450000"
                className={`input-field ${errors.canon_mensual ? '!border-red-300 !shadow-none' : ''}`}
                required
              />
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
                type="number"
                value={form.deposito_requerido}
                onChange={e => setForm({ ...form, deposito_requerido: e.target.value })}
                placeholder="0"
                className={`input-field ${errors.deposito_requerido ? '!border-red-300 !shadow-none' : ''}`}
              />
              {errors.deposito_requerido && <p className="text-xs text-red-600 mt-1">{errors.deposito_requerido}</p>}
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
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Ubicación en mapa <span className="text-neutral-400 font-normal">(opcional, guarda coords directo)</span></label>
            <p className="text-[11px] text-neutral-400 mb-2">Ubicación de referencia en mapa detectada. Si el nombre del sector no coincide exactamente, selecciona o escribe el nombre correcto de tu barrio abajo.</p>
            <MapPicker
              lat={form.latitud}
              lng={form.longitud}
              onChange={(nuevaLat, nuevaLng) => setForm(f => ({ ...f, latitud: nuevaLat, longitud: nuevaLng }))}
              onAddressSuggestion={(dir) => setForm(f => ({
                ...f,
                direccion_referencial: f.direccion_referencial.trim().length >= 10 ? f.direccion_referencial : dir.slice(0, 200),
              }))}
              onGeoError={(msg) => notifyToast(msg)}
            />
          </div>

          {/* Tarea 2 (v8): coords vinculadas al mapa, sin cajas numéricas visibles. */}
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

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Servicios *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SERVICIOS.map(s => (
                <label key={s.id} className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border cursor-pointer select-none transition ${form.servicios_ids.includes(s.id) ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'}`}>
                  <input type="checkbox" className="sr-only" checked={form.servicios_ids.includes(s.id)} onChange={() => toggleArray('servicios_ids', s.id)} />
                  {s.nombre}
                </label>
              ))}
            </div>
            {errors.servicios_ids && <p className="text-xs text-red-600 mt-1">{errors.servicios_ids}</p>}
          </div>

          {/* Tarea 3 (v7): sin "Campus asociado" — las distancias a Tulcán, Torobajo,
              Centro, Salud… se autocalculan desde la ubicación del mapa. */}
          <p className="text-xs text-neutral-500 bg-navy-50 border border-navy-100 rounded-lg px-3 py-2">
            📍 Las distancias a Tulcán, Torobajo, Centro y demás puntos se calculan solas con la ubicación que marques en el mapa.
          </p>

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Fotos * <span className="text-neutral-400 font-normal">(sube archivos o pega URLs)</span></label>
            {/* BUG-F3-03 (fix): respetar vaciado. Antes `urls.length ? urls : f.fotos` ignoraba Limpiar. */}
            <UploadFotos token={token} initialUrls={form.fotos} onUrls={(urls) => setForm(f => ({ ...f, fotos: urls }))} />
            {errors.fotos && <p className="text-xs text-red-600 mt-1">{errors.fotos}</p>}
            <details className="mt-2">
              <summary className="text-xs text-neutral-400 cursor-pointer hover:text-navy-600">¿Prefieres pegar URLs? (opcional)</summary>
              <div className="mt-2 space-y-1">
                {[0, 1, 2].map((i) => (
                  <input key={i} type="url" value={form.fotos[i] || ''} onChange={e => {
                    const a = [...form.fotos]; a[i] = e.target.value; setForm({ ...form, fotos: a })
                  }} placeholder={`https://.../foto${i + 1}.jpg`} className="input-field text-xs" />
                ))}
                <p className="text-xs text-neutral-400">Si subiste fotos arriba, estas URLs se ignoran.</p>
              </div>
            </details>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={submitting} aria-disabled={submitting} className="btn-accent w-full justify-center disabled:opacity-60 disabled:cursor-wait">
              {submitting
                ? (<span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Guardando publicación...</span>)
                : 'Enviar a revision'}
            </button>
            <p className="text-xs text-neutral-400 text-center mt-3">
              Requiere cuenta de arrendador. Estado inicial: PENDIENTE.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
