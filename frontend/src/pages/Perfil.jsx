import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import Icono from '../components/Icono'
import { notifyToast } from '../components/Toast'
import PreferenciasRoomie from '../components/PreferenciasRoomie'
import { authHead, bearer } from '../services/authHeaders'
import { leerToken } from '../services/tokenStorage'
import { checklistPerfil } from '../utils/perfil'
import AccesoPerfil from './perfil/AccesoPerfil'
import AvisosTab from './perfil/AvisosTab'
import ConfianzaTab from './perfil/ConfianzaTab'
import DatosTab from './perfil/DatosTab'
import ResumenCuenta from './perfil/ResumenCuenta'
import SeguridadTab from './perfil/SeguridadTab'
import { useBorradorPerfil } from './perfil/useBorradorPerfil'
import { useMisStats } from './perfil/useMisStats'

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

/**
 * Token local re-sincronizado: el navbar puede cerrar sesión (AuthContext.logout)
 * y un token rancio mostraría 401.
 */
function useTokenSincronizado() {
  const [token, setToken] = useState(() => leerToken())
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
  return [token, setToken]
}

/** Pestaña activa sincronizada con el hash (#datos, #seguridad, #confianza, #avisos). */
function useTabHash() {
  const [tab, setTab] = useState(() => tabDesdeHash())
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
  return [tab, irTab]
}

function EsqueletoPerfil() {
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

function CabeceraPerfil({ error }) {
  return (
    <>
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

      {/* El éxito se confirma con toast flotante (notifyToast); aquí solo quedan los errores. */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md flex items-center gap-2" role="alert">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </>
  )
}

function BarraPestanas({ tab, onElegir }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar fade-x border-b border-neutral-150" role="tablist" aria-label="Secciones del perfil">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          id={`tab-${t.id}`}
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onElegir(t.id)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 -mb-px transition ${tab === t.id
            ? 'border-gold-400 text-navy-900'
            : 'border-transparent text-neutral-400 hover:text-navy-700'
            }`}
        >
          <span aria-hidden="true" className="inline-flex"><Icono nombre={t.icon} className="w-4 h-4" /></span> {t.label}
        </button>
      ))}
    </div>
  )
}

export default function Perfil() {
  const [token, setToken] = useTokenSincronizado()
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, irTab] = useTabHash()
  const [tabPendiente, setTabPendiente] = useState(null)
  const borrador = useBorradorPerfil(perfil)
  const misStats = useMisStats(token)

  // Parchea el contexto global (Nav) además del estado local.
  const { actualizarUsuario } = useAuth()
  const aplicarFoto = (url) => {
    setPerfil((p) => (p ? { ...p, foto_perfil_url: url } : p))
    actualizarUsuario({ foto_perfil_url: url })
  }

  const cargarPerfil = async (authToken) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/auth/perfil', {
        headers: bearer(authToken)
      })
      setPerfil(res.data)
      borrador.cargarDesde(res.data)
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
    setError('')
  }, [token])

  const handleGuardarDatos = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await api.patch('/api/auth/perfil', borrador.cuerpo(), authHead(token))
      setPerfil(res.data)
      borrador.cargarDesde(res.data, { conNombre: false })
      // Toast flotante (visible sin importar el scroll) en vez de banner fijo.
      notifyToast('Cambios guardados en tu perfil')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const toggleTag = (key) => {
    borrador.toggleTag(key)
    setError('')
  }

  // Sin window.confirm (vetado en el repo): al cambiar de pestaña con borrador
  // se abre ConfirmDialog y el borrador se conserva decida lo que decida.
  const irTabGuard = (id) => {
    if (id !== tab && borrador.sucio) {
      setTabPendiente(id)
      return
    }
    irTab(id)
  }

  if (!token) {
    return <AccesoPerfil onSesionIniciada={setToken} />
  }

  if (loading && !perfil) {
    return <EsqueletoPerfil />
  }

  const check = checklistPerfil(perfil, { tieneAviso: (misStats?.total ?? 0) > 0 })

  return (
    <div className="container-main py-6 md:py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <CabeceraPerfil error={error} />
        {/* Layout desktop en 2 columnas (sidebar + contenido); en móvil se apila. */}
        <div className="md:grid md:grid-cols-12 md:gap-8 md:items-start space-y-6 md:space-y-0">
          <ResumenCuenta perfil={perfil} token={token} check={check} onCambioFoto={aplicarFoto} irTab={irTabGuard} />
          <div className="md:col-span-8 min-w-0">
            <BarraPestanas tab={tab} onElegir={irTabGuard} />

            {tab === 'datos' && (
              <DatosTab
                perfil={perfil}
                token={token}
                borrador={borrador}
                saving={saving}
                setPerfil={setPerfil}
                onGuardar={handleGuardarDatos}
                onRecargarPerfil={() => token && cargarPerfil(token)}
                onToggleTag={toggleTag}
                onIrARoomie={() => irTabGuard('roomie')}
              />
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
