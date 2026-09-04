import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import UploadFotos from '../components/UploadFotos'

const SERVICIOS = [
  { id: 1, nombre: 'WiFi Fibra' },
  { id: 2, nombre: 'Baño Privado' },
  { id: 3, nombre: 'Cocina Compartida' },
  { id: 4, nombre: 'Amoblado' },
  { id: 5, nombre: 'Lavadora' },
]
const ZONAS = [
  { id: 1, nombre: 'Centro' },
  { id: 2, nombre: 'Pandiguando' },
  { id: 3, nombre: 'Tulcán' },
]

export default function Publicar() {
  const [campus, setCampus] = useState([])
  const [token, setToken] = useState(() => localStorage.getItem('alojau_token') || '')
  const [loginEmail, setLoginEmail] = useState('arrendador@alojau.com')
  const [loginPass, setLoginPass] = useState('AlojaU123')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    tipo_inmueble: 'HABITACION_INDEPENDIENTE',
    canon_mensual: '',
    deposito_requerido: '0',
    zona_barrio_id: 3,
    direccion_referencial: '',
    reglas_convivencia: '',
    latitud: '',
    longitud: '',
    servicios_ids: [1],
    campus_ids: [1],
    fotos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop', 'https://images.unsplash.com/photo-1493809842364-78817add58d1?w=600&h=400&fit=crop'],
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitOk, setSubmitOk] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/api/campus')
      .then(r => setCampus(r.data))
      .catch(() => setCampus([{ id: 1, institucion: 'Universidad del Cauca', nombre_sede: 'Campus Tulcán' }]))
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError(''); setLoginLoading(true)
    try {
      const r = await api.post('/api/auth/login', { email: loginEmail, password: loginPass })
      const t = r.data.access_token
      localStorage.setItem('alojau_token', t)
      setToken(t)
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Credenciales inválidas (usa arrendador@alojau.com / AlojaU123)')
    } finally { setLoginLoading(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem('alojau_token')
    setToken('')
  }

  const validate = () => {
    const e = {}
    if (!form.titulo || form.titulo.trim().length < 10) e.titulo = 'Mínimo 10 caracteres'
    if (form.titulo && form.titulo.length > 150) e.titulo = 'Máximo 150 caracteres'
    if (!form.descripcion || form.descripcion.trim().length < 20) e.descripcion = 'Mínimo 20 caracteres'
    if (!form.canon_mensual || Number(form.canon_mensual) <= 0) e.canon_mensual = 'Canon > 0'
    if (Number(form.canon_mensual) > 10_000_000) e.canon_mensual = 'Máximo 10M'
    if (form.deposito_requerido === '' || Number(form.deposito_requerido) < 0) e.deposito_requerido = 'Depósito >=0'
    if (!form.direccion_referencial || form.direccion_referencial.trim().length < 10) e.direccion_referencial = 'Mínimo 10 caracteres'
    if (!form.reglas_convivencia || form.reglas_convivencia.trim().length < 10) e.reglas_convivencia = 'Mínimo 10 caracteres'
    if (form.servicios_ids.length === 0) e.servicios_ids = 'Selecciona al menos 1 servicio'
    if (form.campus_ids.length === 0) e.campus_ids = 'Selecciona al menos 1 campus'
    const fotosValid = form.fotos.filter(f => f.trim() !== '')
    if (fotosValid.length < 3) e.fotos = 'Mínimo 3 fotos (URLs válidas)'
    else {
      for (const url of fotosValid) {
        try { new URL(url); if (!url.startsWith('http')) throw new Error() } catch { e.fotos = 'URLs deben ser http(s) válidas'; break }
      }
    }
    if (form.latitud !== '' && (isNaN(Number(form.latitud)) || Number(form.latitud) < -90 || Number(form.latitud) > 90)) e.latitud = 'Latitud entre -90 y 90'
    if (form.longitud !== '' && (isNaN(Number(form.longitud)) || Number(form.longitud) < -180 || Number(form.longitud) > 180)) e.longitud = 'Longitud entre -180 y 180'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(''); setSubmitOk(null)
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
      zona_barrio_id: Number(form.zona_barrio_id),
      direccion_referencial: form.direccion_referencial.trim(),
      reglas_convivencia: form.reglas_convivencia.trim(),
      latitud: form.latitud === '' ? null : Number(form.latitud),
      longitud: form.longitud === '' ? null : Number(form.longitud),
      servicios_ids: form.servicios_ids,
      campus_ids: form.campus_ids,
      fotos: fotosValid,
    }
    try {
      const r = await api.post('/api/publicaciones', payload, { headers: { Authorization: `Bearer ${token}` } })
      setSubmitOk(r.data)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setSubmitError(detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(' | '))
      } else if (typeof detail === 'string') {
        setSubmitError(detail)
      } else if (err.response?.status === 401) {
        setSubmitError('No autorizado. Verifica tu token ARRENDADOR.')
      } else if (err.response?.status === 403) {
        setSubmitError('Solo ARRENDADOR puede publicar (403)')
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

            <div className="bg-gold-50 border border-gold-200 rounded-md p-3 mb-4 text-xs sm:text-sm">
              <p className="font-medium text-gold-700">Demo:</p>
              <p className="text-gold-600">Email: <code>arrendador@alojau.com</code> / Pass: <code>AlojaU123</code></p>
            </div>

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
              <button disabled={loginLoading} className="btn-accent w-full justify-center">
                {loginLoading ? 'Ingresando...' : 'Iniciar sesión como ARRENDADOR'}
              </button>
            </form>

            <div className="mt-3 text-xs">
              <button
                onClick={() => {
                  const t = 'mock-token-arrendador'; localStorage.setItem('alojau_token', t); setToken(t)
                }}
                className="text-navy-600 hover:text-navy-700 hover:underline"
              >
                Usar mock-token-arrendador sin password (solo dev)
              </button>
            </div>
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
            <button onClick={handleLogout} className="text-xs sm:text-sm text-neutral-500 hover:text-red-600">Cerrar sesión</button>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Completa los datos. La publicacion pasara a estado PENDIENTE hasta ser revisada.
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
            <p className="text-sm text-emerald-700 mt-1">{submitOk.mensaje || ''}</p>
            {submitOk.indice_confianza != null && (
              <p className="text-xs text-emerald-600 mt-2">Índice confianza: <b>{submitOk.indice_confianza}</b> — {submitOk.advertencia}</p>
            )}
            <p className="text-xs text-emerald-500 mt-2">ID {submitOk.id} — No aparece en catálogo hasta ser aprobada.</p>
          </div>
        )}
        {submitError && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm break-words">{submitError}</p>}

        <form onSubmit={handleSubmit} className="card p-6 md:p-8 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Titulo de la publicacion * <span className="text-neutral-400 font-normal">(10-150)</span></label>
            <input
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ej: Habitacion amoblada cerca al Tulcan"
              className={`input-field ${errors.titulo ? '!border-red-300 !shadow-none' : ''}`}
              required
            />
            {errors.titulo && <p className="text-xs text-red-600 mt-1">{errors.titulo}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Descripcion * <span className="text-neutral-400 font-normal">(20-2000)</span></label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              placeholder="Amoblada, baño privado, WiFi 200MB, cerca universidad..."
              className={`input-field resize-none ${errors.descripcion ? '!border-red-300 !shadow-none' : ''}`}
            />
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
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Zona / barrio *</label>
            <select
              value={form.zona_barrio_id}
              onChange={e => setForm({ ...form, zona_barrio_id: Number(e.target.value) })}
              className="select-field"
            >
              {ZONAS.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Direccion referencial *</label>
            <input
              value={form.direccion_referencial}
              onChange={e => setForm({ ...form, direccion_referencial: e.target.value })}
              placeholder="No compartas tu direccion exacta"
              className={`input-field ${errors.direccion_referencial ? '!border-red-300 !shadow-none' : ''}`}
              required
            />
            {errors.direccion_referencial && <p className="text-xs text-red-600 mt-1">{errors.direccion_referencial}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Reglas de convivencia *</label>
            <textarea
              value={form.reglas_convivencia}
              onChange={e => setForm({ ...form, reglas_convivencia: e.target.value })}
              placeholder="Describe las reglas de convivencia..."
              rows={3}
              className={`input-field resize-none ${errors.reglas_convivencia ? '!border-red-300 !shadow-none' : ''}`}
            />
            {errors.reglas_convivencia && <p className="text-xs text-red-600 mt-1">{errors.reglas_convivencia}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Latitud <span className="text-neutral-400 font-normal">(opcional)</span></label>
              <input
                type="number"
                step="any"
                value={form.latitud}
                onChange={e => setForm({ ...form, latitud: e.target.value })}
                placeholder="2.443"
                className={`input-field ${errors.latitud ? '!border-red-300 !shadow-none' : ''}`}
              />
              {errors.latitud && <p className="text-xs text-red-600 mt-1">{errors.latitud}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Longitud <span className="text-neutral-400 font-normal">(opcional)</span></label>
              <input
                type="number"
                step="any"
                value={form.longitud}
                onChange={e => setForm({ ...form, longitud: e.target.value })}
                placeholder="-76.606"
                className={`input-field ${errors.longitud ? '!border-red-300 !shadow-none' : ''}`}
              />
              {errors.longitud && <p className="text-xs text-red-600 mt-1">{errors.longitud}</p>}
            </div>
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

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Campus asociado *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {campus.map(c => (
                <label key={c.id} className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border cursor-pointer select-none transition ${form.campus_ids.includes(c.id) ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'}`}>
                  <input type="checkbox" className="sr-only" checked={form.campus_ids.includes(c.id)} onChange={() => toggleArray('campus_ids', c.id)} />
                  {c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}
                </label>
              ))}
              {campus.length === 0 && <span className="text-xs text-neutral-400">Cargando campus...</span>}
            </div>
            {errors.campus_ids && <p className="text-xs text-red-600 mt-1">{errors.campus_ids}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">Fotos * <span className="text-neutral-400 font-normal">(sube archivos o pega URLs)</span></label>
            <UploadFotos token={token} initialUrls={form.fotos} onUrls={(urls) => setForm(f => ({ ...f, fotos: urls.length ? urls : f.fotos }))} />
            {errors.fotos && <p className="text-xs text-red-600 mt-1">{errors.fotos}</p>}
            <details className="mt-2">
              <summary className="text-xs text-neutral-400 cursor-pointer hover:text-navy-600">¿Prefieres pegar URLs? (opcional)</summary>
              <div className="mt-2 space-y-1">
                {form.fotos.slice(0, 3).map((url, i) => (
                  <input key={i} type="url" value={url} onChange={e => {
                    const a = [...form.fotos]; a[i] = e.target.value; setForm({ ...form, fotos: a })
                  }} placeholder={`https://.../foto${i + 1}.jpg`} className="input-field text-xs" />
                ))}
                <p className="text-xs text-neutral-400">Si subiste fotos arriba, estas URLs se ignoran.</p>
              </div>
            </details>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={submitting} className="btn-accent w-full justify-center">
              {submitting ? 'Enviando...' : 'Enviar a revision'}
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
