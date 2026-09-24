import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { emitAuthChange, inicialesDe, limpiarSesionLocal } from '../contexts/AuthContext'
import { formatearSesionFecha, etiquetaDispositivo } from '../utils/sesion'
import GoogleButton from '../components/GoogleButton'
import RegistroForm from '../components/RegistroForm'
import OtpForm from '../components/OtpForm'
import { signInWithGoogle } from '../services/supabaseClient'

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

// Indicativo +57 separado del número local (10 dígitos CO).
// canónico E.164: '+57' + local. Ej: '573001234567' <-> '3001234567'.
export function telefonoALocal(raw = '') {
  const d = String(raw || '').replace(/\D/g, '')
  return d.startsWith('57') && d.length > 10 ? d.slice(2) : d
}

export function telefonoAE164(local = '') {
  return `+57${telefonoALocal(local)}`
}

export const ROL_LABEL = {
  ESTUDIANTE: 'Usuario Base',
  ARRENDADOR: 'Arrendador Activo',
  ADMIN: 'Administrador',
  MODERADOR_CAMPUS: 'Moderador',
  AUDITOR_LEGAL: 'Auditor',
}

// v13.2 etiquetas opt-in (claves permitidas por el backend: filtros.* roomie.* notis.*).
// Nada sensible (Ley 1581): solo hábitos de convivencia aportados voluntariamente.
export const TAGS_DISPONIBLES = [
  { key: 'roomie.buscando', label: '🔍 Busco roomie', hint: 'Te avisaremos de perfiles compatibles' },
  { key: 'filtros.mascotas', label: '🐾 Tengo mascota', hint: 'Prioriza avisos que aceptan mascotas' },
  { key: 'filtros.tranquilo', label: '🌙 Ambiente tranquilo', hint: 'Prioriza zonas y reglas tranquilas' },
  { key: 'notis.novedades', label: '🔔 Novedades', hint: 'Avisos nuevos según tus filtros' },
]

export function checklistPerfil(perfil) {
  const items = [
    { id: 'nombre', label: 'Nombre completo', ok: (perfil?.nombre_completo || '').trim().length >= 3 },
    { id: 'email', label: 'Correo confirmado', ok: !!perfil?.email_verificado },
    { id: 'telefono', label: 'Teléfono vinculado', ok: !!perfil?.telefono_whatsapp },
    { id: 'bio', label: 'Presentación', ok: (perfil?.bio || '').trim().length > 0 },
    { id: 'foto', label: 'Foto de perfil', ok: !!perfil?.foto_perfil_url },
    { id: 'tags', label: 'Al menos 1 etiqueta', ok: Object.values(perfil?.preferencias || {}).some(Boolean) },
  ]
  const pct = Math.round((items.filter(i => i.ok).length / items.length) * 100)
  return { items, pct }
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
  // v13.2 marketplace flexible: bio, foto y etiquetas.
  const [bio, setBio] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')
  const [tags, setTags] = useState({})

  // Formulario de login si no hay token
  const [modoAuth, setModoAuth] = useState('login') // login|registro
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Seguridad & contraseña
  const [pwActual, setPwActual] = useState('')
  const [pwNueva, setPwNueva] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Solicitud de verificación
  const [solSaving, setSolSaving] = useState(false)

  // v13: sesiones activas + revocación global.
  const [sesiones, setSesiones] = useState(null)
  const [revocando, setRevocando] = useState(false)

  // v13.1: eliminación de cuenta (soft-delete 30 días).
  const [mostrarEliminar, setMostrarEliminar] = useState(false)
  const [delEmail, setDelEmail] = useState('')
  const [delPass, setDelPass] = useState('')
  const [eliminando, setEliminando] = useState(false)

  const handleEliminarCuenta = async (e) => {
    e?.preventDefault()
    if (!token || eliminando) return
    setEliminando(true)
    setError('')
    try {
      const r = await api.request({
        method: 'delete',
        url: '/api/auth/cuenta',
        data: { confirm_email: delEmail, password: delPass || undefined },
        headers: { Authorization: `Bearer ${token}` },
      })
      setSuccessMsg(r.data?.mensaje || 'Cuenta marcada para eliminación.')
      // M1: limpieza total compartida (no solo el token).
      limpiarSesionLocal()
      setToken('')
      setPerfil(null)
      emitAuthChange()
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo eliminar la cuenta.')
    } finally {
      setEliminando(false)
    }
  }

  const cargarSesiones = async (authToken) => {
    try {
      const r = await api.get('/api/auth/sesiones', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      setSesiones(Array.isArray(r.data) ? r.data : [])
    } catch {
      setSesiones(null)
    }
  }

  const revocarTodas = async () => {
    if (!token) return
    setRevocando(true)
    setError('')
    try {
      const r = await api.post('/api/auth/sesiones/revocar-todas', {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSuccessMsg(r.data?.mensaje || 'Sesiones revocadas. Vuelve a iniciar sesión.')
      setSesiones([])
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron revocar las sesiones.')
    } finally {
      setRevocando(false)
    }
  }

  // Resumen del dueño (totales vía /mias; si falla se oculta en silencio).
  const [misStats, setMisStats] = useState(null)

  // Pestañas sincronizadas con el hash (#datos, #seguridad, #confianza, #avisos).
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
      setBio(res.data.bio || '')
      setFotoUrl(res.data.foto_perfil_url || '')
      setTags(res.data.preferencias || {})
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
      cargarSesiones(token)
      return
    }
    // M1 efecto fantasma: sin token no quedan datos privados en memoria.
    setPerfil(null)
    setSesiones(null)
    setMisStats(null)
    setError('')
    setSuccessMsg('')
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

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(e?.message || 'Google OAuth no está configurado todavía.')
      setGoogleLoading(false)
    }
  }

  // Si el usuario va a Google y vuelve con "atrás", la página puede restaurarse
  // del bfcache con loading=true eternamente: al recuperar visibilidad se resetea.
  useEffect(() => {
    const alVolver = () => setGoogleLoading(false)
    const alVisibles = () => { if (document.visibilityState === 'visible') setGoogleLoading(false) }
    window.addEventListener('pageshow', alVolver)
    document.addEventListener('visibilitychange', alVisibles)
    return () => {
      window.removeEventListener('pageshow', alVolver)
      document.removeEventListener('visibilitychange', alVisibles)
    }
  }, [])

  // Nota UX: el cierre de sesión vive en el dropdown del navbar (AuthContext.logout).

  const handleGuardarDatos = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const body = {
        nombre_completo: nombre,
        // Vacío -> el backend lo guarda NULL (desvincula). Con dígitos -> E.164.
        telefono_whatsapp: telefono.trim() === '' ? '' : telefonoAE164(telefono),
        bio: bio.trim(),
        foto_perfil_url: fotoUrl.trim() === '' ? null : fotoUrl.trim(),
        preferencias: tags,
      }
      const res = await api.patch('/api/auth/perfil', body,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPerfil(res.data)
      setTelefono(telefonoALocal(res.data.telefono_whatsapp))
      setBio(res.data.bio || '')
      setFotoUrl(res.data.foto_perfil_url || '')
      setTags(res.data.preferencias || {})
      setSuccessMsg('Datos de contacto actualizados con éxito.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  // v13.2: etiquetas opt-in con guardado inmediato (merge en backend).
  const toggleTag = async (key) => {
    const next = { ...tags, [key]: !tags[key] }
    setTags(next)
    setError('')
    try {
      const res = await api.patch('/api/auth/perfil', { preferencias: { [key]: next[key] } },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPerfil(res.data)
      setTags(res.data.preferencias || next)
    } catch (err) {
      setTags(tags)
      setError(err?.response?.data?.detail || 'No se pudo guardar la etiqueta.')
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
            <p className="text-sm text-neutral-500 mb-4">
              Debes iniciar sesión para ver y editar tu información de contacto.
            </p>

            <GoogleButton loading={googleLoading} onClick={handleGoogle} />
            <div className="flex items-center gap-3 my-4" aria-hidden="true">
              <span className="flex-1 h-px bg-neutral-200" />
              <span className="text-[11px] text-neutral-400">o</span>
              <span className="flex-1 h-px bg-neutral-200" />
            </div>
            <div className="flex gap-1 mb-4 border-b border-neutral-150" role="tablist" aria-label="Entrar o crear cuenta">
              <button type="button" role="tab" aria-selected={modoAuth === 'login'}
                onClick={() => setModoAuth('login')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${modoAuth === 'login' ? 'border-gold-400 text-navy-900' : 'border-transparent text-neutral-400'}`}>
                Entrar
              </button>
              <button type="button" role="tab" aria-selected={modoAuth === 'registro'}
                onClick={() => setModoAuth('registro')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${modoAuth === 'registro' ? 'border-gold-400 text-navy-900' : 'border-transparent text-neutral-400'}`}>
                Crear cuenta
              </button>
            </div>

            {modoAuth === 'registro' ? (
              <RegistroForm onRegistrado={(t) => {
                if (t) {
                  localStorage.setItem('alojau_token', t)
                  setToken(t)
                  emitAuthChange()
                }
              }} />
            ) : (
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
              <p className="text-xs text-center">
                <Link to="/recuperar" className="text-navy-700 underline hover:text-navy-900">
                  ¿Olvidaste tu contraseña?
                </Link>
              </p>
            </form>
            )}
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

        {/* Pestañas con hash (#datos, #seguridad, #confianza, #avisos). */}
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
          <div id="panel-datos" role="tabpanel" aria-labelledby="tab-datos" aria-label="Datos personales y contacto" tabIndex={0} className="space-y-4">
            {/* Tarjeta identidad: quién eres + rol + progreso */}
            <section aria-label="Tu cuenta" className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              {perfil?.foto_perfil_url ? (
                <img
                  src={perfil.foto_perfil_url}
                  alt={`Foto de ${perfil?.nombre_completo || 'usuario'}`}
                  className="w-14 h-14 rounded-full object-cover border border-neutral-200 shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <span aria-hidden="true" className="w-14 h-14 rounded-full bg-navy-800 text-white text-lg font-bold flex items-center justify-center shrink-0">
                  {inicialesDe(perfil)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-navy-900 truncate" title={perfil?.nombre_completo || ''}>{perfil?.nombre_completo || 'Usuario AlojaU'}</h2>
                {/* El correo vive solo en el campo "Correo" del formulario (sin duplicar). */}
                <p className="text-xs text-neutral-500 mt-0.5">
                  {perfil?.telefono_whatsapp ? `📱 ${perfil.telefono_whatsapp}` : '📱 Sin teléfono'} · {estaVerificado ? 'verificado' : 'sin verificar'}
                </p>
              </div>
              <span className="badge bg-navy-50 text-navy-700 border border-navy-100 font-semibold text-xs shrink-0" title={perfil?.rol === 'ARRENDADOR' ? 'Publica y gestiona avisos' : 'Busca, guarda favoritos y contacta'}>
                {ROL_LABEL[perfil?.rol] || perfil?.rol || 'Usuario Base'}
              </span>
            </div>

            {/* v13.2 checklist progresiva + explicación del ciclo de rol */}
            {(() => {
              const check = checklistPerfil(perfil)
              return (
                <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-4 space-y-2" aria-label="Completa tu perfil">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Completa tu perfil ({check.pct}%)</h3>
                    <span className="text-[11px] text-neutral-500">{check.items.filter(i => i.ok).length}/{check.items.length}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${check.pct}%` }} />
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {check.items.map(i => (
                      <li key={i.id} className={i.ok ? 'text-emerald-700' : 'text-neutral-400'}>
                        {i.ok ? '✓' : '•'} {i.label}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    {perfil?.rol === 'ARRENDADOR'
                      ? 'Eres Arrendador Activo mientras tengas al menos un aviso vigente. Si eliminas tu último aviso, vuelves a Usuario Base automáticamente.'
                      : 'Publica tu primer aviso para activar el rol de Arrendador automáticamente. Si lo eliminas todo, vuelves a Usuario Base.'}
                  </p>
                </div>
              )
            })()}
            </section>

            <form onSubmit={handleGuardarDatos} className="space-y-4">
            {/* Tarjeta identidad editable: nombre */}
            <section aria-label="Identidad" className="card p-6 space-y-4">
              <h3 className="text-sm font-bold text-navy-900">👤 Identidad</h3>
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
            </section>

            {/* Tarjeta contacto: correo + teléfono */}
            <section aria-label="Contacto" className="card p-6 space-y-4">
              <h3 className="text-sm font-bold text-navy-900">📱 Contacto</h3>
              <p className="text-[11px] text-neutral-400 -mt-2">Cómo te contactan los interesados. El teléfono verificado suma +20 de confianza.</p>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="perfil-correo" className="block text-sm font-semibold text-navy-800">Correo</label>
                  {perfil?.email_verificado ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ Correo verificado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Sin verificar
                    </span>
                  )}
                </div>
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
                  Solo los 10 dígitos de tu línea (el +57 ya va incluido). Vacío = sin vincular (no podrás publicar hasta vincularlo).
                </p>
              </div>
            </section>

            {/* Tarjeta presentación: bio + foto + etiquetas */}
            <section aria-label="Presentación" className="card p-6 space-y-4">
              <h3 className="text-sm font-bold text-navy-900">✨ Presentación</h3>
              <p className="text-[11px] text-neutral-400 -mt-2">Opcional. Cuéntales a otros quién eres y qué buscas.</p>
              <div>
                <label htmlFor="perfil-bio" className="block text-sm font-semibold text-navy-800 mb-1.5">Presentación <span className="text-neutral-400 font-normal">(opcional, máx 500)</span></label>
                <textarea
                  id="perfil-bio"
                  value={bio}
                  onChange={e => setBio(e.target.value.slice(0, 500))}
                  placeholder="Cuéntanos quién eres: estudio, hábitos, qué buscas…"
                  rows={2}
                  className="input-field resize-none"
                />
              </div>
              <div>
                <label htmlFor="perfil-foto" className="block text-sm font-semibold text-navy-800 mb-1.5">Foto de perfil <span className="text-neutral-400 font-normal">(URL https, opcional)</span></label>
                <input
                  id="perfil-foto"
                  type="url"
                  value={fotoUrl}
                  onChange={e => setFotoUrl(e.target.value)}
                  placeholder="https://… (Google la llena sola al entrar)"
                  className="input-field"
                />
              </div>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            </form>

            {/* v13.2 etiquetas opt-in para personalizar tu experiencia */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold text-navy-900">Tus etiquetas</h3>
              <p className="text-xs text-neutral-500">
                Opcionales y revocables: sirven para priorizar avisos afines (ej. que acepten mascotas) y avisarte de roomies. Nada sensible.
              </p>
              <div className="flex flex-wrap gap-2">
                {TAGS_DISPONIBLES.map(t => {
                  const activa = !!tags[t.key]
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTag(t.key)}
                      aria-pressed={activa}
                      title={t.hint}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${activa
                        ? 'bg-navy-800 text-white border-navy-800'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'
                        }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* OLA2-M4: verificación solo-lectura (la otorga un administrador) */}            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
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
            {perfil?.auth_provider === 'google' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" role="note">
                <p className="text-sm font-semibold text-emerald-800">
                  🔐 Tu cuenta utiliza inicio de sesión seguro con Google.
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  No requiere una contraseña local: entras con tu cuenta de Google y ya está verificada.
                </p>
              </div>
            ) : (
            <>
            <p className="text-xs text-neutral-500">Te pedimos la actual por seguridad. La nueva debe tener al menos 8 caracteres con letras y números.</p>
            <form onSubmit={handleCambiarPassword} className="space-y-4">
              <div>
                <label htmlFor="perfil-pw-actual" className="block text-sm font-medium text-navy-800 mb-1.5">Contraseña actual</label>
                <input
                  id="perfil-pw-actual"
                  type="password"
                  value={pwActual}
                  onChange={e => setPwActual(e.target.value)}
                  className="input-field"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label htmlFor="perfil-pw-nueva" className="block text-sm font-medium text-navy-800 mb-1.5">Nueva contraseña</label>
                <input
                  id="perfil-pw-nueva"
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
            <p className="text-xs">
              <Link to="/recuperar" className="text-navy-700 underline hover:text-navy-900">
                ¿Olvidaste tu contraseña? Recupérala con un enlace de 15 minutos
              </Link>
            </p>
            </>
            )}
            {/* v13: sesiones activas + revocación global */}
            <div className="border-t border-neutral-150 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-navy-900">Sesiones activas</h3>
              {sesiones == null ? (
                <p className="text-xs text-neutral-400">Cargando sesiones…</p>
              ) : sesiones.length === 0 ? (
                <p className="text-xs text-neutral-400">No hay sesiones registradas (modo sin base de datos).</p>
              ) : (
                <ul className="space-y-1.5">
                  {sesiones.map((s) => {
                    const fecha = formatearSesionFecha(s.creado_en) || 'reciente'
                    return (
                      <li key={s.jti} className="flex items-center justify-between gap-2 text-xs bg-neutral-50 border border-neutral-150 rounded-md px-3 py-2">
                        <span className="text-neutral-600 truncate">
                          {etiquetaDispositivo(s.user_agent)} · {fecha}
                          {s.actual ? ' · este dispositivo' : ''}
                        </span>
                        {s.actual && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                            Actual
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={revocarTodas}
                disabled={revocando}
                className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition disabled:opacity-50"
              >
                {revocando ? 'Cerrando…' : 'Cerrar sesión en todos los dispositivos'}
              </button>
            </div>
            {/* v13.1 zona de peligro: eliminar cuenta (gracia 30 días recuperable) */}
            <div className="border-t border-red-100 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-red-700">Zona de peligro</h3>
              {!mostrarEliminar ? (
                <button
                  type="button"
                  onClick={() => setMostrarEliminar(true)}
                  className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition"
                >
                  Eliminar mi cuenta…
                </button>
              ) : (
                <form onSubmit={handleEliminarCuenta} className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Tu cuenta se desactiva de inmediato y se <b>borra definitivamente en 30 días</b>.
                    Dentro de ese plazo puedes recuperarla iniciando sesión con Google o en
                    {' '}<Link to="/recuperar" className="underline">recuperación de cuenta</Link>.
                    Para confirmar, escribe tu correo
                    {perfil?.auth_provider === 'password' ? ' y tu contraseña actual' : ''}:
                  </p>
                  <input
                    type="email"
                    value={delEmail}
                    onChange={(e) => setDelEmail(e.target.value)}
                    placeholder={perfil?.email || 'tu@correo.com'}
                    aria-label="Correo de confirmación para eliminar la cuenta"
                    aria-describedby="delEmail-ayuda"
                    className="input-field"
                    required
                  />
                  <p id="delEmail-ayuda" className="text-[11px] text-neutral-500" aria-live="polite">
                    {delEmail.trim() === (perfil?.email || '').trim()
                      ? '✓ El correo coincide.'
                      : 'Escríbelo letra por letra, igual que tu correo de cuenta.'}
                  </p>
                  {perfil?.auth_provider === 'password' && (
                    <input
                      type="password"
                      value={delPass}
                      onChange={(e) => setDelPass(e.target.value)}
                      placeholder="Contraseña actual"
                      aria-label="Contraseña actual para eliminar la cuenta"
                      className="input-field"
                      required
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={eliminando || delEmail.trim() !== (perfil?.email || '').trim()}
                      title={delEmail.trim() !== (perfil?.email || '').trim() ? 'El correo debe coincidir letra por letra' : undefined}
                      className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-md hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {eliminando ? 'Eliminando…' : 'Sí, eliminar mi cuenta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMostrarEliminar(false); setDelEmail(''); setDelPass('') }}
                      className="px-4 py-2 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-md hover:bg-neutral-100 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {tab === 'confianza' && (
          <div id="panel-confianza" role="tabpanel" aria-labelledby="tab-confianza" aria-label="Índice de confianza" tabIndex={0} className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-navy-900">Tu confianza (0–100)</h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Cada aviso publicado hereda estos puntos. En verde lo ya ganado, en ámbar lo pendiente con su acción.
              Pesos configurables por el administrador desde Ajustes del Sistema (40+20+15+15+10).
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Completitud de oferta <span className="text-neutral-400">(se calcula por aviso al publicar)</span></span>
                <span className="font-semibold text-navy-800 shrink-0">40 pts</span>
              </div>
              <div className={`flex justify-between items-center gap-2 py-1.5 px-2 rounded ${estaVerificado ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'bg-amber-50 text-amber-800'}`}>
                <span>Teléfono verificado {estaVerificado ? '(activo en tu cuenta)' : '(pendiente en tu cuenta)'}</span>
                <span className="font-bold shrink-0">{estaVerificado ? '+20 pts ✓' : '0 pts'}</span>
              </div>
              {!estaVerificado && (
                <button
                  type="button"
                  onClick={() => irTab('datos')}
                  className="text-[11px] font-semibold text-navy-700 underline hover:text-navy-900"
                >
                  → Vincula tu teléfono en Datos y contacto
                </button>
              )}
              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Fotos reales (≥3) <span className="text-neutral-400">(súbelas al crear o editar cada aviso)</span></span>
                <span className="font-semibold text-navy-800 shrink-0">15 pts</span>
              </div>
              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
                <span className="text-neutral-600">Vigencia reciente (≤30d) <span className="text-neutral-400">(renueva tus avisos a tiempo)</span></span>
                <span className="font-semibold text-navy-800 shrink-0">15 pts</span>
              </div>
              <div className="flex justify-between items-center gap-2 py-1.5">
                <span className="text-neutral-600">Sin reportes activos <span className="text-neutral-400">(los reportes confirmados restan)</span></span>
                <span className="font-semibold text-navy-800 shrink-0">10 pts</span>
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

            {/* v13: verificación de email obligatoria para publicar */}
            {perfil && !perfil.email_verificado && (
              <OtpForm email={perfil.email} proposito="email_verify"
                onVerificado={() => token && cargarPerfil(token)} />
            )}
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
