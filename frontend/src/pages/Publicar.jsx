// HU-005 Registrar publicación estructurada (PENDIENTE) + HU-006 Renovar vigencia
// FIX: formulario funcional con validación, auth, POST real, UX responsive y accesible
import { useEffect, useState } from 'react'
import { api } from '../services/api'

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

export default function Publicar(){
  const [campus, setCampus] = useState([])
  const [token, setToken] = useState(()=> localStorage.getItem('alojau_token') || '')
  const [loginEmail, setLoginEmail] = useState('arrendador@alojau.com')
  const [loginPass, setLoginPass] = useState('AlojaU123')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // form
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
    fotos: ['https://res.cloudinary.com/demo/image/upload/v1/alojau/demo1.jpg','https://res.cloudinary.com/demo/image/upload/v1/alojau/demo2.jpg','https://res.cloudinary.com/demo/image/upload/v1/alojau/demo3.jpg'],
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitOk, setSubmitOk] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(()=>{
    api.get('/api/campus').then(r=> setCampus(r.data)).catch(()=> setCampus([{id:1, institucion:'Universidad del Cauca', nombre_sede:'Campus Tulcán'}]))
  },[])

  const handleLogin = async (e)=>{
    e.preventDefault()
    setLoginError(''); setLoginLoading(true)
    try{
      const r = await api.post('/api/auth/login', { email: loginEmail, password: loginPass })
      const t = r.data.access_token
      localStorage.setItem('alojau_token', t)
      setToken(t)
    }catch(err){
      setLoginError(err.response?.data?.detail || 'Credenciales inválidas (usa arrendador@alojau.com / AlojaU123 o mock-token-arrendador)')
    }finally{ setLoginLoading(false) }
  }
  const handleLogout = ()=>{
    localStorage.removeItem('alojau_token')
    setToken('')
  }

  const validate = ()=>{
    const e = {}
    if(!form.titulo || form.titulo.trim().length < 10) e.titulo = 'Mínimo 10 caracteres'
    if(form.titulo && form.titulo.length > 150) e.titulo = 'Máximo 150 caracteres'
    if(!form.descripcion || form.descripcion.trim().length < 20) e.descripcion = 'Mínimo 20 caracteres'
    if(!form.canon_mensual || Number(form.canon_mensual) <= 0) e.canon_mensual = 'Canon > 0'
    if(Number(form.canon_mensual) > 10_000_000) e.canon_mensual = 'Máximo 10M'
    if(form.deposito_requerido === '' || Number(form.deposito_requerido) < 0) e.deposito_requerido = 'Depósito >=0'
    if(!form.direccion_referencial || form.direccion_referencial.trim().length < 10) e.direccion_referencial = 'Mínimo 10 caracteres'
    if(!form.reglas_convivencia || form.reglas_convivencia.trim().length < 10) e.reglas_convivencia = 'Mínimo 10 caracteres'
    if(form.servicios_ids.length === 0) e.servicios_ids = 'Selecciona al menos 1 servicio'
    if(form.campus_ids.length === 0) e.campus_ids = 'Selecciona al menos 1 campus'
    const fotosValid = form.fotos.filter(f=> f.trim() !== '')
    if(fotosValid.length < 3) e.fotos = 'Mínimo 3 fotos (URLs válidas)'
    else {
      for(const url of fotosValid){
        try{ new URL(url); if(!url.startsWith('http')) throw new Error() }catch{ e.fotos = 'URLs deben ser http(s) válidas'; break }
      }
    }
    if(form.latitud !== '' && (isNaN(Number(form.latitud)) || Number(form.latitud) < -90 || Number(form.latitud) > 90)) e.latitud = 'Latitud entre -90 y 90'
    if(form.longitud !== '' && (isNaN(Number(form.longitud)) || Number(form.longitud) < -180 || Number(form.longitud) > 180)) e.longitud = 'Longitud entre -180 y 180'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e)=>{
    e.preventDefault()
    setSubmitError(''); setSubmitOk(null)
    if(!validate()) return
    if(!token){
      setSubmitError('Debes iniciar sesión como ARRENDADOR')
      return
    }
    setSubmitting(true)
    const fotosValid = form.fotos.filter(f=> f.trim() !== '')
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
    try{
      const r = await api.post('/api/publicaciones', payload, { headers: { Authorization: `Bearer ${token}` }})
      setSubmitOk(r.data)
    }catch(err){
      const detail = err.response?.data?.detail
      if(Array.isArray(detail)){
        // Pydantic validation errors
        setSubmitError(detail.map(d=> `${d.loc?.join('.')}: ${d.msg}`).join(' | '))
      }else if(typeof detail === 'string'){
        setSubmitError(detail)
      }else if(err.response?.status === 401){
        setSubmitError('No autorizado. Verifica tu token ARRENDADOR.')
      }else if(err.response?.status === 403){
        setSubmitError('Solo ARRENDADOR puede publicar (403)')
      }else{
        setSubmitError(err.message || 'Error al publicar')
      }
    }finally{ setSubmitting(false)}
  }

  const toggleArray = (field, id)=>{
    setForm(f=>{
      const arr = f[field]
      return {...f, [field]: arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id]}
    })
  }

  if(!token){
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h1 className="text-lg sm:text-xl font-bold">Publicar habitación / apartaestudio (HU-005)</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Debes iniciar sesión como <b>ARRENDADOR</b> para publicar. Estado inicial siempre <span className="font-medium text-amber-600">PENDIENTE</span> (no aparece en catálogo hasta moderación).</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 text-xs sm:text-sm">
            <p className="font-medium">Demo sin BD:</p>
            <p>Email: <code>arrendador@alojau.com</code> / Pass: <code>AlojaU123</code></p>
            <p className="text-gray-500">o usa token mock <code>mock-token-arrendador</code> en Authorization.</p>
          </div>
          <form onSubmit={handleLogin} className="grid gap-3 mt-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            </div>
            <div>
              <label className="text-sm font-medium">Contraseña</label>
              <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            </div>
            {loginError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{loginError}</p>}
            <button disabled={loginLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm">{loginLoading? 'Ingresando...':'Iniciar sesión como ARRENDADOR'}</button>
          </form>
          <div className="mt-3 text-xs">
            <button onClick={()=>{
              const t='mock-token-arrendador'; localStorage.setItem('alojau_token', t); setToken(t)
            }} className="text-indigo-600 hover:underline">Usar mock-token-arrendador sin password (solo dev)</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-xl font-bold">Publicar habitación / apartaestudio (HU-005)</h1>
          <button onClick={handleLogout} className="text-xs sm:text-sm text-gray-500 hover:text-red-600">Cerrar sesión</button>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Campos obligatorios: título, descripción, tipo, canon, zona, dirección, reglas, ≥3 fotos, al menos 1 servicio y 1 campus. Estado inicial <b>PENDIENTE</b>.</p>

        {submitOk && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
            <p className="font-medium text-green-800">¡Publicación creada! Estado: {submitOk.estado}</p>
            <p className="text-sm text-green-700 mt-1">{submitOk.mensaje || ''}</p>
            {submitOk.indice_confianza != null && (
              <p className="text-xs mt-2">Índice confianza: <b>{submitOk.indice_confianza}</b> — {JSON.stringify(submitOk.desglose)} — {submitOk.advertencia}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">ID {submitOk.id} — No aparece en catálogo hasta ser aprobada (HU-005 C3).</p>
          </div>
        )}
        {submitError && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mt-4 text-sm break-words">{submitError}</p>}

        <form onSubmit={handleSubmit} className="grid gap-4 mt-5" noValidate>
          <div>
            <label className="text-sm font-medium">Título * <span className="text-gray-400 font-normal">(10-150)</span></label>
            <input value={form.titulo} onChange={e=>setForm({...form, titulo:e.target.value})} placeholder="Ej: Habitación luminosa cerca Tulcán" className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.titulo ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
            {errors.titulo && <p className="text-xs text-red-600 mt-1">{errors.titulo}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Descripción * <span className="text-gray-400 font-normal">(20-2000)</span></label>
            <textarea value={form.descripcion} onChange={e=>setForm({...form, descripcion:e.target.value})} rows={3} placeholder="Amoblada, baño privado, WiFi 200MB, cerca universidad..." className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.descripcion ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
            {errors.descripcion && <p className="text-xs text-red-600 mt-1">{errors.descripcion}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Tipo inmueble *</label>
              <select value={form.tipo_inmueble} onChange={e=>setForm({...form, tipo_inmueble:e.target.value})} className="border border-gray-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="HABITACION_FAMILIAR">Habitación familiar</option>
                <option value="HABITACION_INDEPENDIENTE">Habitación independiente</option>
                <option value="APARTAESTUDIO">Apartaestudio</option>
                <option value="COMPARTIDO">Compartido</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Zona / barrio *</label>
              <select value={form.zona_barrio_id} onChange={e=>setForm({...form, zona_barrio_id:Number(e.target.value)})} className="border border-gray-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {ZONAS.map(z=> <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Canon mensual COP *</label>
              <input type="number" value={form.canon_mensual} onChange={e=>setForm({...form, canon_mensual:e.target.value})} placeholder="480000" className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.canon_mensual ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
              {errors.canon_mensual && <p className="text-xs text-red-600 mt-1">{errors.canon_mensual}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Depósito (0 si no aplica)</label>
              <input type="number" value={form.deposito_requerido} onChange={e=>setForm({...form, deposito_requerido:e.target.value})} className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.deposito_requerido ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
              {errors.deposito_requerido && <p className="text-xs text-red-600 mt-1">{errors.deposito_requerido}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Dirección referencial * <span className="text-gray-400 font-normal">(no número exacto si no quieres)</span></label>
            <input value={form.direccion_referencial} onChange={e=>setForm({...form, direccion_referencial:e.target.value})} placeholder="Calle 5 # 2-10 Tulcán" className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.direccion_referencial ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
            {errors.direccion_referencial && <p className="text-xs text-red-600 mt-1">{errors.direccion_referencial}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Reglas de convivencia *</label>
            <textarea value={form.reglas_convivencia} onChange={e=>setForm({...form, reglas_convivencia:e.target.value})} rows={2} placeholder="No mascotas, visitas hasta 9pm, aseo compartido..." className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.reglas_convivencia ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
            {errors.reglas_convivencia && <p className="text-xs text-red-600 mt-1">{errors.reglas_convivencia}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Latitud <span className="text-gray-400 font-normal">(opcional, -90 a 90)</span></label>
              <input type="number" step="any" value={form.latitud} onChange={e=>setForm({...form, latitud:e.target.value})} placeholder="2.443" className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.latitud ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
              {errors.latitud && <p className="text-xs text-red-600 mt-1">{errors.latitud}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Longitud <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="number" step="any" value={form.longitud} onChange={e=>setForm({...form, longitud:e.target.value})} placeholder="-76.606" className={`border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 ${errors.longitud ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-indigo-500'}`} />
              {errors.longitud && <p className="text-xs text-red-600 mt-1">{errors.longitud}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Servicios *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SERVICIOS.map(s=> (
                <label key={s.id} className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border cursor-pointer select-none ${form.servicios_ids.includes(s.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                  <input type="checkbox" className="sr-only" checked={form.servicios_ids.includes(s.id)} onChange={()=> toggleArray('servicios_ids', s.id)} />
                  {s.nombre}
                </label>
              ))}
            </div>
            {errors.servicios_ids && <p className="text-xs text-red-600 mt-1">{errors.servicios_ids}</p>}
          </div>

          <div>
            <label className="text-sm font-medium">Campus asociado *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {campus.map(c=> (
                <label key={c.id} className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border cursor-pointer select-none ${form.campus_ids.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                  <input type="checkbox" className="sr-only" checked={form.campus_ids.includes(c.id)} onChange={()=> toggleArray('campus_ids', c.id)} />
                  {c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}
                </label>
              ))}
              {campus.length===0 && <span className="text-xs text-gray-400">Cargando campus...</span>}
            </div>
            {errors.campus_ids && <p className="text-xs text-red-600 mt-1">{errors.campus_ids}</p>}
          </div>

          <div>
            <label className="text-sm font-medium">Fotos (URLs) * <span className="text-gray-400 font-normal">(mínimo 3, máximo 10)</span></label>
            {form.fotos.map((url,i)=> (
              <div key={i} className="flex gap-2 mt-1">
                <input type="url" value={url} onChange={e=>{
                  const a=[...form.fotos]; a[i]=e.target.value; setForm({...form, fotos:a})
                }} placeholder={`https://.../foto${i+1}.jpg`} className="border border-gray-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0" />
                {form.fotos.length>3 && <button type="button" onClick={()=>{
                  setForm({...form, fotos: form.fotos.filter((_,idx)=> idx!==i)})
                }} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 shrink-0">Quitar</button>}
              </div>
            ))}
            {form.fotos.length < 10 && (
              <button type="button" onClick={()=> setForm({...form, fotos: [...form.fotos, '']})} className="text-xs text-indigo-600 hover:underline mt-1">+ Añadir otra foto</button>
            )}
            {errors.fotos && <p className="text-xs text-red-600 mt-1">{errors.fotos}</p>}
          </div>

          <button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium text-sm mt-2">
            {submitting ? 'Enviando...' : 'Enviar a PENDIENTE (requiere ARRENDADOR)'}
          </button>
          <p className="text-xs text-gray-400 text-center">Al enviar aceptas que tu publicación quede PENDIENTE hasta moderación (HU-010). No se muestra en catálogo público.</p>
        </form>
        <p className="text-xs text-gray-400 mt-4">HU-006: Mis publicaciones → Renovar → +30 días + recalcula índice (Sprint2).</p>
      </div>
    </div>
  )
}
