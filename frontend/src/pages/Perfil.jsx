import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { emitAuthChange, inicialesDe } from '../contexts/AuthContext'

const TABS = [
  { id: 'datos', label: 'Datos y contacto', icon: '👤' },
  { id: 'seguridad', label: 'Seguridad', icon: '🔒' },
  { id: 'confianza', label: 'Confianza', icon: '⭐' },
  { id: 'avisos', label: 'Avisos y favoritos', icon: '🏠' },
]

function tabDesdeHash() {
  try {
    const h = (window.location.hash || '').replace('#', '')
    if (TABS.some((t) => t.id === h)) return h
  } catch { /* SSR/tests sin hash */ }
  return 'datos'
}

// Tarea 5 (v4): indicativo +57 separado del número local (10 dígitos CO).
// canónico E.164: '+57' + local. Ej: '573001234567' <-> '3001234567'.
export function telefonoALocal(raw = '') {
  const d = String(raw || '').replace(/\D/g, '')
  return d.startsWith('57') && d.length > 10 ? d.slice(2) : d
}

export function telefonoAE164(local = '') {
  return `+57${telefonoALocal(local)}`
}

function fortalezaPassword(pw) {
  return {
    longitud: pw.length >= 8,
    alfanumerica: /[A-Za-z]/.test(pw) && /[0-9]/.test(pw),
  }
}

export default function Perfil() {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('alojau_token') || '' } catch { return '' }
  })
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [tab, setTab] = useState(() => tabDesdeHash())

  // Formulario de edición
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')

  // Formulario de login si no hay token
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Seguridad & contraseña
  const [pwActual, setPwActual] = useState('')
  const [pwNueva, setPwNueva] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Solicitud de verificación
  const [solSaving, setSolSaving] = useState(false)

  // Resumen del dueño (totales vía /mias; si falla se oculta en silencio).
  const [misStats, setMisStats] = useState(null)

  // Tarea 2: pestañas sincronizadas con el hash (#datos, #seguridad, #confianza, #avisos).
  useEffect(() => {
    const onHash = () => setTab(tabDesdeHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const irTab = (id) => {
    setTab(id)
    try {
      if ((window.location.hash || '') !== `#${id}`) window.location.hash = id
    } catch { /* noop */ }
  }

  const cargarPerfil = async (authToken) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/auth/perfil', {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setPerfil(res.data)
      setTelefono(telefonoALocal(res.data.telefono_whatsapp))
      setNombre(res.data.nombre_completo || '')
    } catch {
      setError('No se pudo cargar el perfil. Por favor inicia sesión nuevamente.')
      setPerfil(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      cargarPerfil(token)
    }
  }, [token])

  // Stats livianas: 3 totales (size=1) en paralelo; cualquier fallo -> sin stats.
  useEffect(() => {
    if (!token) { setMisStats(null); return }
    let vivo = true
    const head = { headers: { Authorization: `Bearer ${token}` } }
    Promise.all([
      api.get('/api/publicaciones/mias', { params: { size: 1 }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
      api.get('/api/publicaciones/mias', { params: { size: 1, estado: 'ACTIVO' }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
      api.get('/api/publicaciones/mias', { params: { size: 1, estado: 'PENDIENTE' }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
    ]).then(([total, activas, pendientes]) => {
      if (vivo) setMisStats(total == null ? null : { total, activas: activas ?? 0, pendientes: pendientes ?? 0 })
    })
    return () => { vivo = false }
  }, [token])

  // UX-AUDIT P0: el navbar puede cerrar sesión (AuthContext.logout); si este
  // token local queda rancio, la vista mostraría 401. Re-sincroniza con eventos.
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
    setLoginLoading(true)
    setError('')
    try {
      const r = await api.post('/api/auth/login', { email: loginEmail, password: loginPass })
      const t = r.data.access_token
      localStorage.setItem('alojau_token', t)
      setToken(t)
      emitAuthChange() // UX: avisa al navbar para mostrar el avatar al instante
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al iniciar sesión')
    } finally {
      setLoginLoading(false)
    }
  }

  // Nota UX: el cierre de sesión vive en el dropdown del navbar (AuthContext.logout).

  const handleGuardarDatos = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const res = await api.patch(
        '/api/auth/perfil',
        // Tarea 5 (v4): el input edita solo el local; se guarda en E.164 (+57…).
        { telefono_whatsapp: telefonoAE164(telefono), nombre_completo: nombre },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPerfil(res.data)
      setTelefono(telefonoALocal(res.data.telefono_whatsapp))
      setSuccessMsg('Datos de contacto actualizados con éxito.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const handleSolicitarVerificacion = async () => {
    setSolSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const r = await api.post('/api/auth/perfil/solicitud-verificacion', {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSuccessMsg(r.data?.mensaje || 'Solicitud registrada. Un administrador verificará tu línea.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo registrar la solicitud.')
    } finally {
      setSolSaving(false)
    }
  }

  const handleCambiarPassword = async (e) => {
    e?.preventDefault()
    setPwSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const r = await api.patch('/api/auth/perfil/password',
        { actual: pwActual, nueva: pwNueva },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSuccessMsg(r.data?.mensaje || 'Contraseña actualizada con éxito.')
      setPwActual('')
      setPwNueva('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo actualizar la contraseña.')
    } finally {
      setPwSaving(false)
    }
  }

  // OLA2-M4: la verificación es solo-lectura (la otorga un administrador).
  // Se removió el toggle de auto-verificación: PATCH /perfil ya no acepta telefono_verificado.

  if (!token) {
    return (
      <div className="container-main py-8 md:py-12">
        <div className="max-w-xl mx-auto">
          <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Mi Perfil</span>
          </nav>

          <div className="card p-6 md:p-8">
            <div className="w-12 h-12 bg-navy-50 text-navy-800 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold text-navy-900 tracking-tight mb-2">
              Mi Perfil
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              Debes iniciar sesión para ver y editar tu información de contacto.
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
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>}
              <button type="submit" disabled={loginLoading} className="btn-accent w-full justify-center">
                {loginLoading ? 'Ingresando...' : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (loading && !perfil) {
    return (
      <div className="container-main py-12">
        <div className="max-w-2xl mx-auto card p-8 animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded w-1/3" />
          <div className="h-4 bg-neutral-200 rounded w-1/2" />
          <div className="h-32 bg-neutral-100 rounded" />
        </div>
      </div>
    )
  }

  const estaVerificado = !!perfil?.telefono_verificado
  const fort = fortalezaPassword(pwNueva)
  const pwValida = pwActual.trim() !== '' && fort.longitud && fort.alfanumerica && pwNueva !== pwActual

  return (
    <div className="container-main py-6 md:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Cabecera (el acceso admin vive unificado en el Navbar: Admin AlojaU ▾). */}
        <div>
          <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Mi Perfil</span>
          </nav>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight">
            Mi Perfil
          </h1>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md flex items-center gap-2" role="alert">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-md flex items-center gap-2" role="status">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tarea 2: pestañas con hash (#datos, #seguridad, #confianza, #avisos). */}
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-150" role="tablist" aria-label="Secciones del perfil">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => irTab(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition ${tab === t.id
                ? 'border-gold-400 text-navy-900'
                : 'border-transparent text-neutral-400 hover:text-navy-700'
                }`}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {tab === 'datos' && (
          <div id="panel-datos" role="tabpanel" aria-labelledby="tab-datos" aria-label="Datos personales y contacto" tabIndex={0} className="card p-6 space-y-6">
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="w-14 h-14 rounded-full bg-navy-800 text-white text-lg font-bold flex items-center justify-center shrink-0">
                {inicialesDe(perfil)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-navy-900 truncate" title={perfil?.nombre_completo || ''}>{perfil?.nombre_completo || 'Usuario AlojaU'}</h2>
                {/* El correo vive solo en el campo "Correo" del formulario (sin duplicar). */}
                <p className="text-xs text-neutral-500 mt-0.5">
                  {perfil?.telefono_whatsapp ? `📱 ${perfil.telefono_whatsapp}` : '📱 Sin teléfono'} · {estaVerificado ? 'verificado' : 'sin verificar'}
                </p>
              </div>
              <span className="badge bg-navy-50 text-navy-700 border border-navy-100 font-semibold text-xs shrink-0">
                {perfil?.rol || 'ARRENDADOR'}
              </span>
            </div>

            <form onSubmit={handleGuardarDatos} className="space-y-4">
              <div>
                <label htmlFor="perfil-nombre" className="block text-sm font-semibold text-navy-800 mb-1.5">Nombre completo</label>
                <input
                  id="perfil-nombre"
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Tu nombre y apellido"
                  className="input-field"
                  minLength={3}
                  maxLength={150}
                />
              </div>
              <div>
                <label htmlFor="perfil-correo" className="block text-sm font-semibold text-navy-800 mb-1.5">Correo</label>
                <input id="perfil-correo" type="email" value={perfil?.email || ''} disabled className="input-field opacity-60" aria-describedby="correo-ayuda" />
                <p id="correo-ayuda" className="text-[11px] text-neutral-400 mt-1">El correo identifica tu cuenta y no se puede cambiar.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="perfil-telefono" className="block text-sm font-semibold text-navy-800">Teléfono WhatsApp</label>
                  {estaVerificado ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ Verificado (+20 pts)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Sin verificar (0 pts)
                    </span>
                  )}
                </div>
                <div className="flex" role="group" aria-label="Teléfono WhatsApp con indicativo Colombia">
                  <span aria-hidden="true" className="inline-flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-100 text-sm font-bold text-neutral-600 shrink-0">
                    +57 🇨🇴
                  </span>
                  <input
                    id="perfil-telefono"
                    type="tel"
                    inputMode="numeric"
                    value={telefono}
                    onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="300 123 4567"
                    aria-describedby="telefono-ayuda"
                    className="input-field !rounded-l-none"
                  />
                </div>
                <p id="telefono-ayuda" className="text-[11px] text-neutral-400 mt-1">
                  Solo los 10 dígitos de tu línea (el +57 ya va incluido).
                </p>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>

            {/* OLA2-M4: verificación solo-lectura (la otorga un administrador) */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Verificación de teléfono</h3>
              <p className="text-xs text-neutral-500">
                {estaVerificado
                  ? 'Tu línea está verificada: +20 puntos al índice de confianza y contacto directo habilitado.'
                  : 'Un administrador debe verificar tu línea para otorgar +20 puntos y habilitar el contacto directo.'}
              </p>
              {!estaVerificado && (
                <button
                  type="button"
                  onClick={handleSolicitarVerificacion}
                  disabled={solSaving}
                  className="px-4 py-2 text-xs font-semibold text-navy-700 border border-navy-200 rounded-md hover:bg-navy-50 transition disabled:opacity-50"
                >
                  {solSaving ? 'Enviando...' : 'Solicitar verificación'}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'seguridad' && (
          <div id="panel-seguridad" role="tabpanel" aria-labelledby="tab-seguridad" aria-label="Seguridad y contraseña" tabIndex={0} className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-navy-900">Cambiar contraseña</h2>
            <p className="text-xs text-neutral-500">Te pedimos la actual por seguridad. La nueva debe tener al menos 8 caracteres con letras y números.</p>
            <form onSubmit={handleCambiarPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Contraseña actual</label>
                <input
                  type="password"
                  value={pwActual}
                  onChange={e => setPwActual(e.target.value)}
                  className="input-field"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Nueva contraseña</label>
                <input
                  type="password"
                  value={pwNueva}
                  onChange={e => setPwNueva(e.target.value)}
                  className="input-field"
                  autoComplete="new-password"
                  required
                />
                <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
                  <li className={fort.longitud ? 'text-emerald-700' : 'text-neutral-400'}>
                    {fort.longitud ? '✓' : '•'} Mínimo 8 caracteres
                  </li>
                  <li className={fort.alfanumerica ? 'text-emerald-700' : 'text-neutral-400'}>
                    {fort.alfanumerica ? '✓' : '•'} Incluye letras y números
                  </li>
                  <li className={pwNueva && pwNueva !== pwActual ? 'text-emerald-700' : 'text-neutral-400'}>
                    {pwNueva && pwNueva !== pwActual ? '✓' : '•'} Distinta de la actual
                  </li>
                </ul>
              </div>
              <button
                type="submit"
                disabled={pwSaving || !pwValida}
                className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
              >
                {pwSaving ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </form>
          </div>
        )}

        {tab === 'confianza' && (
          <div id="panel-confianza" role="tabpanel" aria-labelledby="tab-confianza" aria-label="Índice de confianza" tabIndex={0} className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-navy-900">Cómo se calcula tu índice (0–100)</h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Pesos configurables por el administrador desde Ajustes del Sistema (40+20+15+15+10).
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Completitud de oferta</span>
                <span className="font-semibold text-navy-800">40 pts</span>
              </div>
              <div className={`flex justify-between items-center py-1.5 px-2 rounded ${estaVerificado ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'bg-amber-50 text-amber-800'}`}>
                <span>Teléfono verificado {estaVerificado ? '(activo en tu cuenta)' : '(pendiente en tu cuenta)'}</span>
                <span className="font-bold">{estaVerificado ? '+20 pts ✓' : '0 pts'}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Fotos reales (≥3)</span>
                <span className="font-semibold text-navy-800">15 pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Vigencia reciente (≤30d)</span>
                <span className="font-semibold text-navy-800">15 pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-neutral-600">Sin reportes activos</span>
                <span className="font-semibold text-navy-800">10 pts</span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Informativo, no garantiza seguridad. Verificar antes de pagar. Cada publicación muestra su propio puntaje con este mismo desglose.
            </p>
          </div>
        )}

        {tab === 'avisos' && (
          <div id="panel-avisos" role="tabpanel" aria-labelledby="tab-avisos" aria-label="Mis publicaciones y favoritos" tabIndex={0} className="space-y-4">
            {misStats && (
              <div className="grid grid-cols-3 gap-2" aria-label="Resumen de mis publicaciones">
                <div className="rounded-lg bg-neutral-50 border border-neutral-150 p-3 text-center">
                  <p className="text-xl font-bold text-navy-800">{misStats.total}</p>
                  <p className="text-[11px] text-neutral-500">Avisos</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">{misStats.activas}</p>
                  <p className="text-[11px] text-neutral-500">Publicados</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
                  <p className="text-xl font-bold text-amber-700">{misStats.pendientes}</p>
                  <p className="text-[11px] text-neutral-500">En revisión</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/mis-publicaciones" className="card p-5 hover:border-navy-300 transition block">
                <p className="text-sm font-semibold text-navy-800">🏠 Mis publicaciones</p>
                <p className="text-xs text-neutral-500 mt-1">Crea, edita y renueva tus avisos.</p>
                <span className="inline-block mt-3 text-xs font-semibold text-navy-700">Abrir →</span>
              </Link>
              <Link to="/favoritos" className="card p-5 hover:border-navy-300 transition block">
                <p className="text-sm font-semibold text-navy-800">♡ Favoritos</p>
                <p className="text-xs text-neutral-500 mt-1">Tus alojamientos guardados.</p>
                <span className="inline-block mt-3 text-xs font-semibold text-navy-700">Abrir →</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
