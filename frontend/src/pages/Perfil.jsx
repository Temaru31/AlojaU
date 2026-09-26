import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { emitAuthChange, limpiarSesionLocal, useAuth } from '../contexts/AuthContext'
import { formatearSesionFecha, etiquetaDispositivo } from '../utils/sesion'
import GoogleButton from '../components/GoogleButton'
import RegistroForm from '../components/RegistroForm'
import OtpForm from '../components/OtpForm'
import AvatarPerfil from '../components/AvatarPerfil'
import Icono from '../components/Icono'
import NivelConfianza from '../components/NivelConfianza'
import PreferenceChip from '../components/PreferenceChip'
import TelegramVincular from '../components/TelegramVincular'
import { signInWithGoogle } from '../services/supabaseClient'

// Iconos del set propio (aria-hidden): misma gramática que PreferenceChip.
const TABS = [
  { id: 'datos', label: 'Datos y Verificación', icon: 'usuario' },
  { id: 'seguridad', label: 'Seguridad y Sesiones', icon: 'candado' },
  { id: 'confianza', label: 'Confianza y Reputación', icon: 'estrella' },
  { id: 'avisos', label: 'Mis Publicaciones', icon: 'casa' },
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

// F1 "Tus Preferencias": 8 dimensiones universitarias, SOLO namespace
// filtros.* (válido por el backend: solo chequea prefijo, máx 30 claves).
// Ley 1581: nada sensible, sin "Estudiante" ni demográficos.
// roomie.*/notis.* siguen aceptados por el backend (retrocompatibilidad),
// pero la UI solo ofrece filtros.*. Iconos del set propio estilo Lucide.
// Etiquetas con sujeto explícito (soy/acepto vs busco/necesito): evitan el
// match ambiguo entre lo que el usuario ES y lo que BUSCA en un aviso.
export const TAGS_DISPONIBLES = [
  { key: 'filtros.mascotas', label: 'Acepto mascotas', hint: 'Convivo con mascotas (pet friendly)', icono: 'mascotas' },
  { key: 'filtros.tranquilo', label: 'Busco tranquilidad', hint: 'Prioridad estudio y descanso', icono: 'silencio' },
  { key: 'filtros.no_fumador', label: 'Soy no fumador', hint: 'Ambientes libres de humo', icono: 'humo' },
  { key: 'filtros.misma_facultad', label: 'Busco misma facultad', hint: 'Compartir con compañeros del campus', icono: 'facultad' },
  { key: 'filtros.cocina_equipada', label: 'Necesito cocina equipada', hint: 'Uso libre de cocina', icono: 'cocina' },
  { key: 'filtros.lavadora', label: 'Necesito zona de lavado', hint: 'Acceso a lavadora o lavandería', icono: 'lavado' },
  { key: 'filtros.sin_horario', label: 'Entrada libre 24/7', hint: 'Llave y acceso sin horario de cierre', icono: 'horario' },
  { key: 'filtros.parqueadero', label: 'Parqueadero moto/bici', hint: 'Espacio seguro para moto o bicicleta', icono: 'movilidad' },
]

// M3 barra gamificada con pesos explícitos (suma 100% exacto).
// - Correo verificado 20% · Teléfono 20% · Foto 20%
// - Presentación 15% · ≥1 preferencia 15% · Primer aviso (o ARRENDADOR) 10%
export const PESOS_PERFIL = {
  email: 20, telefono: 20, foto: 20, bio: 15, tags: 15, aviso: 10,
}

export function checklistPerfil(perfil, extra = {}) {
  const tieneAviso = !!extra.tieneAviso || perfil?.rol === 'ARRENDADOR' || perfil?.rol === 'ADMIN'
  const items = [
    { id: 'email', label: 'Correo verificado', peso: PESOS_PERFIL.email, ok: !!perfil?.email_verificado },
    { id: 'telefono', label: 'Teléfono vinculado', peso: PESOS_PERFIL.telefono, ok: !!perfil?.telefono_whatsapp },
    { id: 'foto', label: 'Foto de perfil subida', peso: PESOS_PERFIL.foto, ok: !!perfil?.foto_perfil_url },
    { id: 'bio', label: 'Presentación escrita', peso: PESOS_PERFIL.bio, ok: (perfil?.bio || '').trim().length > 0 },
    { id: 'tags', label: 'Al menos 1 preferencia', peso: PESOS_PERFIL.tags, ok: Object.values(perfil?.preferencias || {}).some(Boolean) },
    { id: 'aviso', label: 'Primer aviso publicado', peso: PESOS_PERFIL.aviso, ok: tieneAviso },
  ]
  const pct = items.reduce((acc, i) => acc + (i.ok ? i.peso : 0), 0)
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

  // R9: parchea el contexto global (Nav) además del estado local.
  const { actualizarUsuario } = useAuth()
  const aplicarFoto = (url) => {
    setPerfil((p) => (p ? { ...p, foto_perfil_url: url } : p))
    actualizarUsuario({ foto_perfil_url: url })
  }

  // Formulario de edición (M3: la foto va por POST /avatar, no en este form).
  const [telefono, setTelefono] = useState('')
  // R1: el teléfono verificado se bloquea hasta pulsar ✏️ (editar resetea a sin verificar al guardar).
  const [telefonoEditando, setTelefonoEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  // v13.2 marketplace flexible: bio y etiquetas (la foto vive en AvatarPerfil).
  const [bio, setBio] = useState('')
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

  // R1: la verificación de teléfono es vía Telegram (bloque unificado en Datos).
  // El bloque huérfano "por administrador" se eliminó (verificación self-service).

  // v13: sesiones activas + revocación global.
  const [sesiones, setSesiones] = useState(null)
  const [revocando, setRevocando] = useState(false)
  // M2: revocar todo cierra ESTA sesión también -> confirma en 2 pasos.
  const [aRevocar, setARevocar] = useState(false)

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
    if (!aRevocar) {
      setARevocar(true)
      return
    }
    setRevocando(true)
    setError('')
    try {
      const r = await api.post('/api/auth/sesiones/revocar-todas', {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSuccessMsg(r.data?.mensaje || 'Sesiones revocadas.')
      // M2: este token también murió -> limpieza total + raíz (sin fantasma).
      setARevocar(false)
      limpiarSesionLocal()
      setToken('')
      setPerfil(null)
      setSesiones(null)
      emitAuthChange()
      try { window.location.replace('/') } catch { /* SSR/tests */ }
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron revocar las sesiones.')
      setARevocar(false)
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
      setTelefonoEditando(false)
      setNombre(res.data.nombre_completo || '')
      setBio(res.data.bio || '')
      setTags(res.data.preferencias || {})
      setTagsDirty(false)
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
        // M3: la foto va por POST/DELETE /api/auth/avatar (no en este form).
        preferencias: tags,
      }
      const res = await api.patch('/api/auth/perfil', body,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPerfil(res.data)
      setTelefono(telefonoALocal(res.data.telefono_whatsapp))
      setBio(res.data.bio || '')
      setTags(res.data.preferencias || {})
      setTagsDirty(false)
      setSuccessMsg('Datos de contacto actualizados con éxito.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  // M2: etiquetas transaccionales (borrador local; se guardan con el form).
  const [tagsDirty, setTagsDirty] = useState(false)
  const mismosPrefs = (a, b) => {
    const ka = Object.keys(a || {}).filter(k => a[k]).sort()
    const kb = Object.keys(b || {}).filter(k => b[k]).sort()
    return ka.length === kb.length && ka.every((k, i) => k === kb[i])
  }
  const toggleTag = (key) => {
    const next = { ...tags, [key]: !tags[key] }
    setTags(next)
    setTagsDirty(!mismosPrefs(next, perfil?.preferencias || {}))
    setError('')
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
          <nav aria-label="Migas de pan" className="hidden md:flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Mi Perfil</span>
          </nav>

          <div className="card p-4 sm:p-6 md:p-8">
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
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Cabecera (el acceso admin vive unificado en el Navbar: Admin AlojaU ▾). */}
        <div>
          <nav aria-label="Migas de pan" className="hidden md:flex items-center gap-2 text-xs text-neutral-400 mb-1">
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

        {/* Layout desktop en 2 columnas (sidebar + contenido); en móvil se apila. */}
        <div className="md:grid md:grid-cols-12 md:gap-8 md:items-start space-y-6 md:space-y-0">
          <aside className="md:col-span-4" aria-label="Resumen de cuenta">
            <div className="lg:sticky lg:top-24 space-y-4">
              {/* Tarjeta de identidad: avatar grande con cambio rápido + rol. */}
              <section aria-label="Tu identidad" className="card rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <AvatarPerfil
                    perfil={perfil}
                    token={token}
                    onCambio={aplicarFoto}
                    tamano="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-navy-900 truncate" title={perfil?.nombre_completo || ''}>{perfil?.nombre_completo || 'Usuario AlojaU'}</h2>
                    <p className="text-xs text-neutral-500 truncate" title={perfil?.email || ''}>{perfil?.email || ''}</p>
                  </div>
                </div>
                {perfil?.bio && (
                  <p className="text-xs text-neutral-600 leading-relaxed line-clamp-2" title={perfil.bio}>{perfil.bio}</p>
                )}
                <span className="inline-flex badge bg-navy-50 text-navy-700 border border-navy-100 font-semibold text-xs" title={perfil?.rol === 'ARRENDADOR' ? 'Publica y gestiona avisos' : 'Busca, guarda favoritos y contacta'}>
                  {perfil?.rol === 'ADMIN' ? 'Administrador' : perfil?.rol === 'ARRENDADOR' ? 'Arrendador' : 'Estudiante'}
                </span>
              </section>
              {/* Widget radial: la ÚNICA métrica visible (sin barra plana duplicada). */}
              <section aria-label="Nivel de confianza" className="card rounded-2xl p-5 sm:p-6 space-y-3 shadow-sm">
                {(() => {
                  const checkSide = checklistPerfil(perfil, { tieneAviso: (misStats?.total ?? 0) > 0 })
                  const pendientes = checkSide.items.filter(i => !i.ok).slice(0, 3)
                  return (
                    <>
                      <NivelConfianza pct={checkSide.pct} />
                      {pendientes.length > 0 && (
                        <ul className="space-y-1.5 pt-1 border-t border-neutral-100">
                          {pendientes.map(i => (
                            <li key={i.id}>
                              {i.id === 'aviso' ? (
                                <Link
                                  to="/publicar"
                                  className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
                                >
                                  → Publicar aviso
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => irTab('datos')}
                                  className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
                                >
                                  → {{
                                    email: 'Verificar correo',
                                    telefono: 'Vincular teléfono',
                                    foto: 'Subir foto',
                                    bio: 'Escribir presentación',
                                    tags: 'Elegir preferencias',
                                  }[i.id] || i.label}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )
                })()}
              </section>
            </div>
          </aside>
          <div className="md:col-span-8 min-w-0">
        {/* Pestañas con hash (#datos, #seguridad, #confianza, #avisos). */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar fade-x border-b border-neutral-150" role="tablist" aria-label="Secciones del perfil">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => irTab(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 -mb-px transition ${tab === t.id
                ? 'border-gold-400 text-navy-900'
                : 'border-transparent text-neutral-400 hover:text-navy-700'
                }`}
            >
              <span aria-hidden="true" className="inline-flex"><Icono nombre={t.icon} className="w-4 h-4" /></span> {t.label}
            </button>
          ))}
        </div>

        {tab === 'datos' && (
          <div id="panel-datos" role="tabpanel" aria-labelledby="tab-datos" aria-label="Datos personales y contacto" tabIndex={0} className="space-y-4">
            {/* La identidad y el progreso viven en el sidebar (sin duplicados). */}
            <form onSubmit={handleGuardarDatos} className="space-y-4">
            {/* Tarjeta identidad editable: nombre */}
            <section aria-label="Identidad" className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
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

            {/* F3 Contacto en tarjetas de estado independientes (verde/ámbar claro). */}
            <section aria-label="Contacto" className="card rounded-2xl p-4 sm:p-6 space-y-3 shadow-sm">
              <h3 className="text-sm font-bold text-navy-900">📱 Contacto</h3>
              <p className="text-xs text-neutral-500 -mt-2">Cómo te contactan los interesados. El teléfono verificado suma +20 de confianza.</p>
              {/* Correo */}
              <div className={`rounded-xl border p-4 space-y-2 ${perfil?.email_verificado ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-800">✉️ Correo electrónico</p>
                  {perfil?.email_verificado ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ Correo verificado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Pendiente
                    </span>
                  )}
                </div>
                <label htmlFor="perfil-correo" className="sr-only">Correo</label>
                <input id="perfil-correo" type="email" value={perfil?.email || ''} disabled className="input-field opacity-60" aria-describedby="correo-ayuda" />
                <p id="correo-ayuda" className="text-xs text-neutral-500">El correo identifica tu cuenta y no se puede cambiar.</p>
                {/* R1: verificación de correo centralizada aquí (antes en Avisos). */}
                {perfil && !perfil.email_verificado && (
                  <div className="pt-1">
                    <OtpForm email={perfil.email} proposito="email_verify"
                      onVerificado={() => token && cargarPerfil(token)} />
                  </div>
                )}
              </div>
              {/* Teléfono + Telegram */}
              <div className={`rounded-xl border p-4 space-y-2 ${estaVerificado ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="perfil-telefono" className="text-sm font-semibold text-navy-800">Teléfono WhatsApp</label>
                  <span className="inline-flex items-center gap-2">
                    {estaVerificado ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ Verificado (+20 pts)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        Sin verificar (0 pts)
                      </span>
                    )}
                    {/* R1: número verificado bloqueado; ✏️ lo habilita (guardar resetea a sin verificar). */}
                    {estaVerificado && !telefonoEditando && (
                      <button
                        type="button"
                        onClick={() => setTelefonoEditando(true)}
                        aria-label="Editar número de teléfono"
                        title="Editar número (pierde la verificación)"
                        className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] rounded-full border border-navy-200 text-navy-700 hover:bg-navy-50 active:bg-navy-100 transition"
                      >
                        <span aria-hidden="true">✏️</span>
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex">
                  <span aria-hidden="true" className="inline-flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-100 text-sm font-bold text-neutral-600 shrink-0">
                    +57 🇨🇴
                  </span>
                  <input
                    id="perfil-telefono"
                    type="tel"
                    inputMode="numeric"
                    value={telefono}
                    disabled={estaVerificado && !telefonoEditando}
                    onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="300 123 4567"
                    aria-describedby="telefono-ayuda"
                    className="input-field !rounded-l-none disabled:opacity-60"
                  />
                </div>
                <p id="telefono-ayuda" className="text-xs text-neutral-500">
                  {estaVerificado && !telefonoEditando
                    ? 'Número verificado y bloqueado. Pulsa ✏️ para cambiarlo (volverá a "Sin verificar").'
                    : 'Solo los 10 dígitos de tu línea (el +57 ya va incluido). Vacío = sin vincular (no podrás publicar hasta vincularlo).'}
                </p>
                {/* R1: verificación vía Telegram unificada junto al teléfono. */}
                <div className="pt-1">
                  <TelegramVincular
                    token={token}
                    vinculado={!!perfil?.telegram_vinculado}
                    onVinculado={() => {
                      setPerfil((p) => (p ? { ...p, telegram_vinculado: true } : p))
                      setSuccessMsg('Telegram vinculado: recibirás los códigos en tu chat.')
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Tarjeta presentación: bio (la foto vive en el avatar superior, sin URL expuesta) */}
            <section aria-label="Presentación" className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-navy-900">✨ Presentación</h3>
              <p className="text-xs text-neutral-500 -mt-2">Opcional. Cuéntales a otros quién eres y qué buscas.</p>
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
            </section>

            {/* M3 "Tus Preferencias": SOLO filtros.* (sin Estudiante ni demográficos Ley 1581). */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold text-navy-900">
                Tus Preferencias
                {tagsDirty && <span className="ml-2 font-semibold text-amber-700">· sin guardar</span>}
              </h3>
              <p className="text-xs text-neutral-500">
                Opcionales y revocables: solo hábitos de convivencia (filtros.*). Nada sensible ni demográfico.
              </p>
              <div className="flex flex-wrap gap-2">
                {TAGS_DISPONIBLES.map(t => (
                  <PreferenceChip
                    key={t.key}
                    icono={t.icono}
                    titulo={t.label}
                    hint={t.hint}
                    activa={!!tags[t.key]}
                    onToggle={() => toggleTag(t.key)}
                  />
                ))}
              </div>
            </div>

            {/* Acciones alineadas abajo-derecha con acento y focus visible. */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-accent w-full sm:w-auto justify-center !py-3.5 !rounded-2xl !text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
            </form>
          </div>
        )}

        {tab === 'seguridad' && (
          <div id="panel-seguridad" role="tabpanel" aria-labelledby="tab-seguridad" aria-label="Seguridad y contraseña" tabIndex={0} className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
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
            {/* v13: sesiones activas + revocación global (Telegram vive en Datos y Verificación) */}
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
                onBlur={() => setARevocar(false)}
                disabled={revocando}
                aria-label={aRevocar ? 'Confirmar cierre en todos los dispositivos' : 'Cerrar sesión en todos los dispositivos'}
                className={`px-4 py-2 text-xs font-semibold rounded-md border transition disabled:opacity-50 ${aRevocar
                  ? 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                  : 'text-red-600 border-red-200 hover:bg-red-50'
                  }`}
              >
                {revocando ? 'Cerrando…' : aRevocar ? '¿Cerrar todas? Incluye este dispositivo' : 'Cerrar sesión en todos los dispositivos'}
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
          <div id="panel-confianza" role="tabpanel" aria-labelledby="tab-confianza" aria-label="Índice de confianza" tabIndex={0} className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
            {/* F3 tarjeta de nivel radial (el desglose por factor sigue debajo intacto). */}
            {(() => {
              const checkRadial = checklistPerfil(perfil, { tieneAviso: (misStats?.total ?? 0) > 0 })
              return <NivelConfianza pct={checkRadial.pct} />
            })()}
            <h2 className="text-base font-semibold text-navy-900">Tu confianza (0–100)</h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              El anillo del panel lateral es la <b>completitud de tu perfil</b>. El desglose de abajo es el
              <b> puntaje que hereda cada aviso publicado</b> (pesos del administrador: 40+20+15+15+10).
            </p>
            {/* Deslinde explícito: lo tuyo (cuenta) vs lo de tus avisos. */}
            <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wide pt-1">Requisitos de tu perfil (usuario)</h3>
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
            </div>
            <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wide pt-2">Calidad de tus inmuebles (arrendador)</h3>
            <div className="space-y-2 text-xs">
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
            <p className="text-[11px] text-neutral-500 leading-relaxed rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2" role="note">
              Las fotos y la vigencia se evalúan individualmente en cada inmueble que publiques, no en tu cuenta personal.
            </p>
            {/* R3: cada pendiente con su acceso directo (la tarjeta deja de ser solo lectura). */}
            {(() => {
              const check = checklistPerfil(perfil, { tieneAviso: (misStats?.total ?? 0) > 0 })
              const pendientes = check.items.filter(i => !i.ok)
              if (pendientes.length === 0) return null
              const destino = (id) => (id === 'aviso' ? '/publicar' : null)
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-2" aria-label="Acciones para ganar confianza">
                  <h3 className="text-xs sm:text-sm font-semibold text-navy-900">
                    Súbela al 100% ({check.pct}% actual)
                  </h3>
                  <ul className="space-y-1.5">
                    {pendientes.map(i => (
                      <li key={i.id}>
                        {destino(i.id) ? (
                          <Link to={destino(i.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 underline hover:text-navy-900">
                            → {i.id === 'aviso' ? 'Publicar mi primer aviso' : i.label} <span className="text-neutral-400 font-normal">(+{i.peso} pts)</span>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => irTab('datos')}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 underline hover:text-navy-900"
                          >
                            → {{
                              email: 'Verificar mi correo',
                              telefono: 'Vincular mi teléfono',
                              foto: 'Subir mi foto',
                              bio: 'Escribir mi presentación',
                              tags: 'Elegir mis preferencias',
                            }[i.id] || i.label} <span className="text-neutral-400 font-normal no-underline">(+{i.peso} pts)</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })()}
            <p className="text-xs text-neutral-500 leading-relaxed">
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
              <Link to="/mis-publicaciones" className="card rounded-2xl p-5 hover:border-navy-300 transition block shadow-sm">
                <p className="text-sm font-semibold text-navy-800">🏠 Mis publicaciones</p>
                <p className="text-xs text-neutral-500 mt-1">Crea, edita y renueva tus avisos.</p>
                <span className="inline-block mt-3 text-xs font-semibold text-navy-700">Abrir →</span>
              </Link>
              <Link to="/favoritos" className="card rounded-2xl p-5 hover:border-navy-300 transition block shadow-sm">
                <p className="text-sm font-semibold text-navy-800">♡ Favoritos</p>
                <p className="text-xs text-neutral-500 mt-1">Tus alojamientos guardados.</p>
                <span className="inline-block mt-3 text-xs font-semibold text-navy-700">Abrir →</span>
              </Link>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}
