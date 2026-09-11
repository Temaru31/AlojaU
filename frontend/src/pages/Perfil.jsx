import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { emitAuthChange, inicialesDe } from '../contexts/AuthContext'

export default function Perfil() {
  const [token, setToken] = useState(() => localStorage.getItem('alojau_token') || '')
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Formulario de edición
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')

  // Formulario de login si no hay token
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Resumen del dueño (totales vía /mias; si falla se oculta en silencio).
  const [misStats, setMisStats] = useState(null)
  // Alertas del sistema (solo ADMIN, vía /api/admin/metricas; si falla se oculta).
  const [alertas, setAlertas] = useState(null)

  const cargarPerfil = async (authToken) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/auth/perfil', {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setPerfil(res.data)
      setTelefono(res.data.telefono_whatsapp || '')
      setNombre(res.data.nombre_completo || '')
    } catch (err) {
      console.error('Error al cargar perfil:', err)
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

  const esAdmin = perfil?.rol === 'ADMIN'

  // Alertas admin: pendientes + reportes (mismo origen que el dashboard).
  useEffect(() => {
    if (!token || !esAdmin) { setAlertas(null); return }
    let vivo = true
    api.get('/api/admin/metricas', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (vivo) setAlertas(r.data) })
      .catch(() => { if (vivo) setAlertas(null) })
    return () => { vivo = false }
  }, [token, esAdmin])

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
        { telefono_whatsapp: telefono, nombre_completo: nombre },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPerfil(res.data)
      setSuccessMsg('Datos de contacto actualizados con éxito.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
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

  return (
    <div className="container-main py-6 md:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumbs & Header (UX: cerrar sesión vive en el dropdown del navbar) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
              <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span className="text-neutral-600">Mi Perfil</span>
            </nav>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight">
              Perfil y Confianza
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500">
              Gestiona tu teléfono de contacto. Un administrador verifica tu cuenta para maximizar el índice de confianza.
            </p>
          </div>
        </div>

        {/* Feedback alerts */}
        {esAdmin && (
          <div className="rounded-xl border-2 border-navy-800 bg-navy-900 text-white p-4 sm:p-5" role="status">
            <p className="font-display font-bold text-base sm:text-lg">🛡️ Modo Administrador Maestro</p>
            <p className="text-xs sm:text-sm text-navy-200 mt-1">
              {alertas
                ? `${alertas.pendientes ?? 0} avisos por revisar · ${alertas.reportes_pendientes ?? 0} reportes pendientes`
                : 'Cargando alertas del sistema…'}
            </p>
            <Link to="/admin/dashboard" className="inline-block mt-3 px-4 py-2 text-xs font-bold bg-gold-400 text-navy-900 rounded-md hover:bg-gold-500 transition">
              Abrir panel admin →
            </Link>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-md flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card Principal: Datos de Perfil y Verificación */}
          <div className="md:col-span-2 card p-6 space-y-6">
            {/* UX: resumen del usuario (antes solo teléfono + confianza) */}
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="w-14 h-14 rounded-full bg-navy-800 text-white text-lg font-bold flex items-center justify-center shrink-0">
                {inicialesDe(perfil)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-navy-900 truncate">{perfil?.nombre_completo || 'Usuario AlojaU'}</h2>
                <p className="text-xs text-neutral-500 truncate">{perfil?.email || 'Sin correo'}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {perfil?.telefono_whatsapp ? `📱 ${perfil.telefono_whatsapp}` : '📱 Sin teléfono'} · {estaVerificado ? 'verificado' : 'sin verificar'}
                </p>
              </div>
              <span className="badge bg-navy-50 text-navy-700 border border-navy-100 font-semibold text-xs shrink-0">
                {perfil?.rol || 'ARRENDADOR'}
              </span>
            </div>
            {misStats && (
              <div className="grid grid-cols-3 gap-2" aria-label="Resumen de mis publicaciones">
                <Link to="/mis-publicaciones" className="rounded-lg bg-neutral-50 border border-neutral-150 p-3 text-center hover:border-navy-300 transition">
                  <p className="text-xl font-bold text-navy-800">{misStats.total}</p>
                  <p className="text-[11px] text-neutral-500">Avisos</p>
                </Link>
                <Link to="/mis-publicaciones" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center hover:border-emerald-300 transition">
                  <p className="text-xl font-bold text-emerald-700">{misStats.activas}</p>
                  <p className="text-[11px] text-neutral-500">Publicados</p>
                </Link>
                <Link to="/mis-publicaciones" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center hover:border-amber-300 transition">
                  <p className="text-xl font-bold text-amber-700">{misStats.pendientes}</p>
                  <p className="text-[11px] text-neutral-500">En revisión</p>
                </Link>
              </div>
            )}
            {/* UX: el resumen (avatar/nombre/email/rol) ya está arriba; aquí solo teléfono */}

            {/* Sección Teléfono y Verificación */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-navy-800">
                  Teléfono WhatsApp
                </label>
                {estaVerificado ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verificado (+20 pts)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Sin verificar (0 pts)
                  </span>
                )}
              </div>

              <form onSubmit={handleGuardarDatos} className="space-y-3">
                <div>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    placeholder="Ej: +573001234567"
                    className="input-field"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Número internacional con prefijo de país (7 a 20 dígitos).
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar número'}
                  </button>
                </div>
              </form>

              {/* OLA2-M4: verificación solo-lectura (la otorga un administrador) */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3 mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-navy-900">
                      Verificación de teléfono
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {estaVerificado
                        ? 'Tu línea está verificada: +20 puntos al índice de confianza y contacto directo habilitado.'
                        : 'Un administrador debe verificar tu línea para otorgar +20 puntos y habilitar el contacto directo.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Lateral: Desglose de Confianza */}
          <div className="space-y-4">
            <div className="card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Sistema de Confianza
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                El índice 0-100 se calcula objetivamente con pesos configurables:
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                  <span className="text-neutral-600">Completitud de oferta</span>
                  <span className="font-semibold text-navy-800">40 pts</span>
                </div>
                <div className={`flex justify-between items-center py-1.5 px-2 rounded ${estaVerificado ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'bg-amber-50 text-amber-800'}`}>
                  <span>Teléfono verificado</span>
                  <span className="font-bold">{estaVerificado ? '+20 pts ✓' : '0 pts (inactivo)'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                  <span className="text-neutral-600">Fotos reales (≥3)</span>
                  <span className="font-semibold text-navy-800">15 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                  <span className="text-neutral-600">Vigencia reciente (≤30d)</span>
                  <span className="font-semibold text-navy-800">15 pts</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-neutral-600">Sin reportes activos</span>
                  <span className="font-semibold text-navy-800">10 pts</span>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to="/"
                  className="block w-full py-2 px-3 text-center text-xs font-medium text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition"
                >
                  Ver publicaciones en vivo →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
