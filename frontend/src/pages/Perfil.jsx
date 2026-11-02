import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import OtpForm from '../components/OtpForm'
import ConfirmDialog from '../components/ConfirmDialog'
import Icono from '../components/Icono'
import { notifyToast } from '../components/Toast'
import PreferenceChip from '../components/PreferenceChip'
import TelegramVincular from '../components/TelegramVincular'
import PreferenciasRoomie from '../components/PreferenciasRoomie'
import { Check, Mail, Pencil, Smartphone, Sparkles, User } from 'lucide-react'
import { authHead, bearer } from '../services/authHeaders'
import { leerToken } from '../services/tokenStorage'
import { checklistPerfil, telefonoAE164, telefonoALocal, TAGS_DISPONIBLES } from '../utils/perfil'
import AccesoPerfil from './perfil/AccesoPerfil'
import AvisosTab from './perfil/AvisosTab'
import ConfianzaTab from './perfil/ConfianzaTab'
import ResumenCuenta from './perfil/ResumenCuenta'
import SeguridadTab from './perfil/SeguridadTab'

// Iconos del set propio (aria-hidden): misma gramática que PreferenceChip.
const TABS = [
  { id: 'datos', label: 'Datos y Verificación', icon: 'usuario' },
  { id: 'roomie', label: 'Convivencia y Roomie', icon: 'facultad' },
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


export default function Perfil() {
  const [token, setToken] = useState(() => {
    return leerToken()
  })
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(() => tabDesdeHash())

  // Parchea el contexto global (Nav) además del estado local.
  const { actualizarUsuario } = useAuth()
  const aplicarFoto = (url) => {
    setPerfil((p) => (p ? { ...p, foto_perfil_url: url } : p))
    actualizarUsuario({ foto_perfil_url: url })
  }

  // Formulario de edición (M3: la foto va por POST /avatar, no en este form).
  const [telefono, setTelefono] = useState('')
  // El teléfono verificado se bloquea hasta pulsar editar (editar resetea a sin verificar al guardar).
  const [telefonoEditando, setTelefonoEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  // Marketplace flexible: bio y etiquetas (la foto vive en AvatarPerfil).
  const [bio, setBio] = useState('')
  const [tags, setTags] = useState({})
  // Etiquetas transaccionales: borrador local que se guarda con el formulario.
  const [tagsDirty, setTagsDirty] = useState(false)



  // La verificación de teléfono es vía Telegram (bloque unificado en Datos).
  // El bloque huérfano "por administrador" se eliminó (verificación self-service).



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
        headers: bearer(authToken)
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
      return
    }
    // Efecto fantasma: sin token no quedan datos privados en memoria.
    setPerfil(null)
    setMisStats(null)
    setError('')
  }, [token])

  // Stats livianas: 3 totales (size=1) en paralelo; cualquier fallo -> sin stats.
  useEffect(() => {
    if (!token) { setMisStats(null); return }
    let vivo = true
    const head = authHead(token)
    Promise.all([
      api.get('/api/publicaciones/mias', { params: { size: 1 }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
      api.get('/api/publicaciones/mias', { params: { size: 1, estado: 'ACTIVO' }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
      api.get('/api/publicaciones/mias', { params: { size: 1, estado: 'PENDIENTE' }, ...head }).then(r => r.data?.total ?? 0).catch(() => null),
    ]).then(([total, activas, pendientes]) => {
      if (vivo) setMisStats(total == null ? null : { total, activas: activas ?? 0, pendientes: pendientes ?? 0 })
    })
    return () => { vivo = false }
  }, [token])

  // El navbar puede cerrar sesión (AuthContext.logout); si este
  // token local queda rancio, la vista mostraría 401. Re-sincroniza con eventos.
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


  // Nota UX: el cierre de sesión vive en el dropdown del navbar (AuthContext.logout).

  const handleGuardarDatos = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        nombre_completo: nombre,
        // Vacío -> el backend lo guarda NULL (desvincula). Con dígitos -> E.164.
        telefono_whatsapp: telefono.trim() === '' ? '' : telefonoAE164(telefono),
        bio: bio.trim(),
        // La foto va por POST/DELETE /api/auth/avatar (no en este form).
        preferencias: tags,
      }
      const res = await api.patch('/api/auth/perfil', body,
        authHead(token)
      )
      setPerfil(res.data)
      setTelefono(telefonoALocal(res.data.telefono_whatsapp))
      setTelefonoEditando(false)
      setBio(res.data.bio || '')
      setTags(res.data.preferencias || {})
      setTagsDirty(false)
      // Toast flotante (visible sin importar el scroll) en vez de banner fijo.
      notifyToast('Cambios guardados en tu perfil')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

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

  // Borrador sucio: nombre, teléfono, bio o etiquetas difieren de lo guardado.
  // Sin window.confirm (vetado en el repo): al cambiar de pestaña con draft
  // se abre ConfirmDialog y el borrador se conserva decida lo que decida.
  const borradorSucio = !!perfil && (
    nombre !== (perfil.nombre_completo || '')
    || telefono !== telefonoALocal(perfil.telefono_whatsapp)
    || bio !== (perfil.bio || '')
    || tagsDirty
  )
  const [tabPendiente, setTabPendiente] = useState(null)
  const irTabGuard = (id) => {
    if (id !== tab && borradorSucio) {
      setTabPendiente(id)
      return
    }
    irTab(id)
  }


  // La verificación es solo-lectura (la otorga un administrador).
  // Se removió el toggle de auto-verificación: PATCH /perfil ya no acepta telefono_verificado.

  if (!token) {
    return <AccesoPerfil onSesionIniciada={setToken} />
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
  const check = checklistPerfil(perfil, { tieneAviso: (misStats?.total ?? 0) > 0 })

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
        {/* El éxito se confirma con toast flotante (notifyToast), visible en
            cualquier scroll; aquí solo quedan los errores (role=alert). */}
        {/* Layout desktop en 2 columnas (sidebar + contenido); en móvil se apila. */}
        <div className="md:grid md:grid-cols-12 md:gap-8 md:items-start space-y-6 md:space-y-0">
          <ResumenCuenta perfil={perfil} token={token} check={check} onCambioFoto={aplicarFoto} irTab={irTabGuard} />
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
              onClick={() => irTabGuard(t.id)}
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
              <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><User aria-hidden="true" className="w-4 h-4" /> Identidad</h3>
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
              <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><Smartphone aria-hidden="true" className="w-4 h-4" /> Contacto</h3>
              <p className="text-xs text-neutral-500 -mt-2">Cómo te contactan los interesados. El teléfono verificado suma +20 de confianza.</p>
              {/* Correo */}
              <div className={`rounded-xl border p-4 space-y-2 ${perfil?.email_verificado ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-800 flex items-center gap-1.5"><Mail aria-hidden="true" className="w-4 h-4" /> Correo electrónico</p>
                  {perfil?.email_verificado ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <Check aria-hidden="true" className="w-4 h-4" /> Correo verificado
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
                        <Check aria-hidden="true" className="w-4 h-4" /> Verificado (+20 pts)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        Sin verificar (0 pts)
                      </span>
                    )}
                    {/* R1: número verificado bloqueado; editar lo habilita (guardar resetea a sin verificar). */}
                    {estaVerificado && !telefonoEditando && (
                      <button
                        type="button"
                        onClick={() => setTelefonoEditando(true)}
                        aria-label="Editar número de teléfono"
                        title="Editar número (pierde la verificación)"
                        className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] rounded-full border border-navy-200 text-navy-700 hover:bg-navy-50 active:bg-navy-100 transition"
                      >
                        <Pencil aria-hidden="true" className="w-4 h-4" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex">
                  <span aria-hidden="true" className="inline-flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-100 text-sm font-bold text-neutral-600 shrink-0">
                    +57
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
                    ? (<>Número verificado y bloqueado. Pulsa <Pencil aria-hidden="true" className="w-3.5 h-3.5 inline" /> para cambiarlo (volverá a "Sin verificar").</>)
                    : 'Solo los 10 dígitos de tu línea (el +57 ya va incluido). Vacío = sin vincular (no podrás publicar hasta vincularlo).'}
                </p>
                {/* R1: verificación vía Telegram unificada junto al teléfono. */}
                <div className="pt-1">
                  <TelegramVincular
                    token={token}
                    vinculado={!!perfil?.telegram_vinculado}
                    telefonoGuardado={!!(perfil?.telefono_whatsapp || '').trim()}
                    telefonoVerificado={!!perfil?.telefono_verificado}
                    onVinculado={() => {
                      setPerfil((p) => (p ? { ...p, telegram_vinculado: true, telefono_verificado: true } : p))
                      notifyToast('¡Número verificado con éxito en AlojaU! (+20 pts de confianza)')
                    }}
                    onDesvinculado={() => {
                      setPerfil((p) => (p ? {
                        ...p, telegram_vinculado: false,
                        telefono_verificado: false, telefono_whatsapp: null,
                      } : p))
                      setTelefono('')
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Tarjeta presentación: bio (la foto vive en el avatar superior, sin URL expuesta) */}
            <section aria-label="Presentación" className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><Sparkles aria-hidden="true" className="w-4 h-4" /> Presentación</h3>
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

              {/* Acceso directo a Preferencias de Convivencia Roomie */}
              <div className="pt-2 border-t border-neutral-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-neutral-600">
                  ¿Buscas compañero de habitación? Configura tus hábitos de convivencia para hacer match con otros estudiantes.
                </p>
                <button
                  type="button"
                  onClick={() => irTabGuard('roomie')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-navy-900 bg-gold-400 hover:bg-gold-500 transition shrink-0 min-h-[36px]"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Perfil de Roomie
                </button>
              </div>
            </div>

            {/* Acciones alineadas abajo-derecha con acento y focus visible. */}
            <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-2">
              {borradorSucio && !saving && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2.5 py-1 self-start sm:self-auto" role="status">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Tienes cambios pendientes sin guardar
                </span>
              )}
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

        {tab === 'roomie' && (
          <div id="panel-roomie" role="tabpanel" aria-labelledby="tab-roomie" aria-label="Preferencias de convivencia y roomie" tabIndex={0}>
            <PreferenciasRoomie
              token={token}
              preferencias={perfil?.preferencias}
              onGuardado={(nuevas) => {
                setPerfil((prev) => ({
                  ...prev,
                  preferencias: { ...(prev?.preferencias || {}), ...nuevas },
                }))
              }}
            />
          </div>
        )}

        {tab === 'seguridad' && (
          <SeguridadTab
            token={token}
            perfil={perfil}
            onError={setError}
            onCuentaCerrada={() => { setToken(''); setPerfil(null) }}
          />
        )}

        {tab === 'confianza' && (
          <ConfianzaTab perfil={perfil} check={check} onIrADatos={() => irTabGuard('datos')} />
        )}

        {tab === 'avisos' && (
          <AvisosTab misStats={misStats} />
        )}
      {/* Guard de pestaña: avisa con cambios sin guardar (el borrador se conserva). */}
      {tabPendiente && (
        <ConfirmDialog
          titulo="¿Salir sin guardar?"
          descripcion="Tienes cambios pendientes sin guardar en Datos y Verificación. Puedes volver y guardarlos, o salir y seguir editando después (no se pierde nada)."
          cancelar="Quedarme y guardar"
          confirmar="Salir sin guardar"
          onCancelar={() => setTabPendiente(null)}
          onConfirmar={() => { const destino = tabPendiente; setTabPendiente(null); irTab(destino) }}
        />
      )}
          </div>
        </div>
      </div>
    </div>
  )
}
