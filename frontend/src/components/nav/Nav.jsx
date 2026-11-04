import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import BrandMark from '../BrandMark'
import Campanita from '../Campanita'
import { useFavoritos } from '../../contexts/FavoritosContext'
import { useComparar } from '../../contexts/CompararContext'
import { useAuth } from '../../contexts/AuthContext'
import MenuMovil from './MenuMovil'
import MenuUsuario from './MenuUsuario'
import { useTotalMias } from './useTotalMias'

function EnlaceEscritorio({ to, children }) {
  const { pathname } = useLocation()
  return (
    <Link
      to={to}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${pathname === to ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
        }`}
    >
      {children}
    </Link>
  )
}

function BotonHamburguesa({ abierto, onAlternar }) {
  return (
    <button type="button"
      onClick={onAlternar}
      aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
      aria-expanded={abierto}
      aria-controls="mobile-menu"
      className="md:hidden p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-500 hover:text-navy-700 rounded-md transition-colors duration-200"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {abierto
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        }
      </svg>
    </button>
  )
}

export default function Nav() {
  const { count: favCount } = useFavoritos()
  const { count: compCount, max: compMax } = useComparar()
  const { token, user, loading: authLoading, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const location = useLocation()

  const closeMenu = () => setMobileOpen(false)
  const closeUser = () => setUserOpen(false)
  // Efecto fantasma: la sesión se decide por usuario verificado, no por
  // token crudo (un token muerto/401 no debe mostrar avatar ni "Mis pubs").
  const sesionActiva = !!token && !!user && !authLoading
  const verificando = !!token && (!user || authLoading)
  const displayName = user?.nombre_completo?.trim() || user?.email?.split('@')[0] || 'Mi cuenta'
  const muestraMisPubs = useTotalMias(sesionActiva, token) !== 0

  // BUG-12: cierre del menú móvil con Esc (+ dropdown de usuario)
  useEffect(() => {
    if (!mobileOpen && !userOpen) return
    const onKey = (e) => { if (e.key === 'Escape') { closeMenu(); closeUser() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, userOpen])

  // Cierra el dropdown al navegar
  useEffect(() => { closeUser() }, [location.pathname])

  return (
    <nav className="bg-white border-b border-neutral-150 sticky top-0 z-50">
      <div className="container-main">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5" aria-label="AlojaU inicio">
              <BrandMark size="md" withText />
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <EnlaceEscritorio to="/">Buscar</EnlaceEscritorio>
              <EnlaceEscritorio to="/comparar">
                Comparar {compCount > 0 && <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full ml-1">{compCount}/{compMax}</span>}
              </EnlaceEscritorio>
              <EnlaceEscritorio to="/roomies">Roomies</EnlaceEscritorio>
              {sesionActiva && muestraMisPubs && (
                <EnlaceEscritorio to="/mis-publicaciones">Mis publicaciones</EnlaceEscritorio>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {favCount > 0 && <span className="text-sm text-neutral-500 inline-flex items-center gap-1" aria-label={`${favCount} favoritos`}><Heart aria-hidden="true" className="w-4 h-4" /> {favCount}</span>}
            {/* Campanita a la izquierda del dropdown de perfil (nunca tras Publicar). */}
            {sesionActiva && <Campanita token={token} />}
            {/* Navbar según sesión verificada; con token sin verificar aún, placeholder neutro. */}
            {sesionActiva && (
              <MenuUsuario
                user={user}
                displayName={displayName}
                abierto={userOpen}
                onAlternar={() => setUserOpen(!userOpen)}
                onCerrar={closeUser}
                onLogout={logout}
                muestraMisPubs={muestraMisPubs}
                favCount={favCount}
              />
            )}
            {!sesionActiva && verificando && (
              <span className="px-3 py-2 text-sm text-neutral-300 animate-pulse" aria-label="Verificando sesión">
                •••
              </span>
            )}
            {!sesionActiva && !verificando && (
              <Link to="/perfil" className="px-3 py-2 text-sm font-medium rounded-md text-neutral-500 hover:text-navy-700 hover:bg-neutral-100 transition-colors">
                Iniciar Sesión
              </Link>
            )}
            <Link to="/publicar" className="btn-accent">
              Publicar
            </Link>
          </div>
          {/* Campanita móvil en la barra superior (logo + campanita + hamburguesa).
              Instancia separada de la de desktop: ambas se sincronizan por el
              evento alojau:notificaciones-change (costo: 2 lecturas tiny/45s). */}
          {sesionActiva && (
            <span className="md:hidden inline-flex">
              <Campanita token={token} />
            </span>
          )}
          <BotonHamburguesa abierto={mobileOpen} onAlternar={() => setMobileOpen(!mobileOpen)} />
        </div>
      </div>
      {mobileOpen && (
        <MenuMovil
          sesionActiva={sesionActiva}
          user={user}
          displayName={displayName}
          muestraMisPubs={muestraMisPubs}
          favCount={favCount}
          compCount={compCount}
          compMax={compMax}
          onCerrar={closeMenu}
          onLogout={logout}
        />
      )}
    </nav>
  )
}
