import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
import Buscar from './pages/Buscar'
import Perfil from './pages/Perfil'
import MisPublicaciones from './pages/MisPublicaciones'
// OLA4: rutas pesadas diferidas (code-splitting). Buscar/Perfil/MisPublicaciones
// quedan eager (landing + auth críticas y livianas).
const Detalle = lazy(() => import('./pages/Detalle'))
const Publicar = lazy(() => import('./pages/Publicar'))
const Comparar = lazy(() => import('./pages/Comparar'))
const Favoritos = lazy(() => import('./pages/Favoritos'))
const AdminReportes = lazy(() => import('./pages/AdminReportes'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminTipos = lazy(() => import('./pages/AdminTipos'))
// v13 Enterprise Auth: OAuth callback, recovery y legal (Ley 1581).
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Recuperar = lazy(() => import('./pages/Recuperar'))
const Restablecer = lazy(() => import('./pages/Restablecer'))
const Terminos = lazy(() => import('./pages/Terminos'))
const Privacidad = lazy(() => import('./pages/Privacidad'))
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import ColdStartBanner from './components/ColdStartBanner'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toast'
import BrandMark from './components/BrandMark'
import { FavoritosProvider, useFavoritos } from './contexts/FavoritosContext'
import { CompararProvider, useComparar } from './contexts/CompararContext'
import { AuthProvider, useAuth, inicialesDe } from './contexts/AuthContext'

// UX: cada cambio de ruta abre arriba del todo (antes: abrir Perfil/Publicar
// desde el fondo del home las dejaba scrolleadas abajo). Solo pathname:
// paginar en Buscar conserva su propio scroll.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    try {
      window.scrollTo(0, 0)
    } catch {
      // SSR/tests sin scroll
    }
  }, [pathname])
  return null
}

function Nav() {
  const { count: favCount } = useFavoritos()
  const { count: compCount, max: compMax } = useComparar()
  const { token, user, loading: authLoading, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  const closeMenu = () => setMobileOpen(false)
  const closeUser = () => setUserOpen(false)
  // M1 efecto fantasma: la sesión se decide por usuario verificado, no por
  // token crudo (un token muerto/401 no debe mostrar avatar ni "Mis pubs").
  const sesionActiva = !!token && !!user && !authLoading
  const verificando = !!token && (!user || authLoading)
  const displayName = user?.nombre_completo?.trim() || user?.email?.split('@')[0] || 'Mi cuenta'

  // BUG-12: cierre del menú móvil con Esc (+ dropdown de usuario)
  useEffect(() => {
    if (!mobileOpen && !userOpen) return
    const onKey = (e) => { if (e.key === 'Escape') { closeMenu(); closeUser() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, userOpen])

  // Cierra el dropdown al navegar
  useEffect(() => { closeUser() }, [location.pathname])

  const mobileLinkCls = (active) =>
    `flex items-center justify-between px-3 py-2.5 min-h-[44px] text-sm font-medium rounded-md transition-colors duration-200 ${active ? 'text-navy-800 bg-navy-50' : 'text-neutral-600 hover:bg-neutral-100'
    }`

  return (
    <nav className="bg-white border-b border-neutral-150 sticky top-0 z-50">
      <div className="container-main">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5" aria-label="AlojaU inicio">
              <BrandMark size="md" withText />
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                  }`}
              >
                Buscar
              </Link>
              <Link
                to="/comparar"
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/comparar') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                  }`}
              >
                Comparar {compCount > 0 && <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full ml-1">{compCount}/{compMax}</span>}
              </Link>
              {sesionActiva && (
                <Link
                  to="/mis-publicaciones"
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/mis-publicaciones') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                    }`}
                >
                  Mis publicaciones
                </Link>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {favCount > 0 && <span className="text-sm text-neutral-500" aria-label={`${favCount} favoritos`}>♡ {favCount}</span>}
            {/* Navbar según sesión verificada; con token sin verificar aún, placeholder neutro. */}
            {!sesionActiva ? (
              verificando ? (
                <span className="px-3 py-2 text-sm text-neutral-300 animate-pulse" aria-label="Verificando sesión">
                  •••
                </span>
              ) : (
                <Link to="/perfil" className="px-3 py-2 text-sm font-medium rounded-md text-neutral-500 hover:text-navy-700 hover:bg-neutral-100 transition-colors">
                  Iniciar Sesión
                </Link>
              )
            ) : (
              <div className="relative">
                <button type="button"
                  onClick={() => setUserOpen(!userOpen)}
                  aria-label="Menú de usuario"
                  aria-expanded={userOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-neutral-200 hover:border-navy-300 hover:bg-neutral-50 transition"
                >
                  <span aria-hidden="true" className="relative w-8 h-8 rounded-full bg-navy-800 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {inicialesDe(user)}
                    {user?.foto_perfil_url && (
                      <img src={user.foto_perfil_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-8 h-8 rounded-full object-cover border border-neutral-200 bg-navy-800" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    )}
                  </span>
                  <span className="text-sm font-medium text-navy-800 max-w-28 truncate">{displayName}</span>
                  <span aria-hidden="true" className={`text-[10px] text-neutral-400 transition-transform ${userOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {userOpen && (
                  <>
                    <div aria-hidden="true" onClick={closeUser} className="fixed inset-0 z-40" />
                    <div role="menu" aria-label="Cuenta" className="absolute right-0 top-11 w-56 rounded-xl border border-neutral-150 shadow-xl bg-white p-2 z-50">
                      <p className="px-3 py-2 text-xs text-neutral-400 truncate border-b border-neutral-100 mb-1" title={user?.email || ''}>
                        {user?.email || 'Sesión activa'}
                      </p>
                      <Link to="/perfil" onClick={closeUser} role="menuitem" className="block px-3 py-2 text-sm font-medium rounded-md text-neutral-600 hover:bg-neutral-100">
                        Mi Perfil
                      </Link>
                      <Link to="/mis-publicaciones" onClick={closeUser} role="menuitem" className="block px-3 py-2 text-sm font-medium rounded-md text-neutral-600 hover:bg-neutral-100">
                        Mis Publicaciones
                      </Link>
                      <Link to="/favoritos" onClick={closeUser} role="menuitem" className="block px-3 py-2 text-sm font-medium rounded-md text-neutral-600 hover:bg-neutral-100">
                        Favoritos{favCount > 0 ? ` (${favCount})` : ''}
                      </Link>
                      {(user?.rol || '').toUpperCase() === 'ADMIN' && (
                        <Link to="/admin/dashboard" onClick={closeUser} role="menuitem" className="block px-3 py-2 text-sm font-bold rounded-md text-navy-800 bg-navy-50 hover:bg-navy-100">
                          🛡️ Panel admin
                        </Link>
                      )}
                      <button type="button"
                        onClick={() => { logout(); closeUser() }}
                        role="menuitem"
                        className="block w-full text-left px-3 py-2 text-sm font-semibold rounded-md text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <Link to="/publicar" className="btn-accent">
              Publicar
            </Link>
          </div>
          <button type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            className="md:hidden p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-500 hover:text-navy-700 rounded-md transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>
      {/* BUG-12: dropdown flotante (no empuja contenido, no obliga scroll) + backdrop */}
      {mobileOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={closeMenu}
            className="md:hidden fixed inset-0 bg-navy-900/30 z-40 transition-opacity duration-200"
          />
          <div
            id="mobile-menu"
            className="md:hidden absolute inset-x-3 top-[68px] rounded-xl border border-neutral-150 shadow-xl bg-white p-2 z-50 transition-all duration-200"
          >
            {/* R5 tarjeta destacada de sesión: avatar+nombre+correo+rol → /perfil */}
            {sesionActiva ? (
              <Link
                to="/perfil"
                onClick={closeMenu}
                aria-label="Abrir mi perfil"
                className="flex items-center gap-3 px-3 py-3 mb-1 rounded-xl bg-navy-50 border border-navy-100 active:bg-navy-100 transition"
              >
                <span aria-hidden="true" className="relative w-11 h-11 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {inicialesDe(user)}
                  {user?.foto_perfil_url && (
                    <img src={user.foto_perfil_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-11 h-11 rounded-full object-cover border border-navy-100 bg-navy-800" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy-900 truncate">{displayName}</span>
                  <span className="block text-[11px] text-neutral-500 truncate">{user?.email || ''}</span>
                  <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-px rounded bg-white text-navy-700 border border-navy-100">
                    {user?.rol === 'ADMIN' ? 'Administrador' : user?.rol === 'ARRENDADOR' ? 'Arrendador' : 'Usuario Base'}
                  </span>
                </span>
                <span aria-hidden="true" className="text-neutral-400">›</span>
              </Link>
            ) : (
              <Link
                to="/perfil"
                onClick={closeMenu}
                className="block w-full px-3 py-3 mb-1 text-sm font-bold text-center text-white bg-navy-800 rounded-xl active:bg-navy-900 transition"
              >
                Iniciar sesión / Registrarse
              </Link>
            )}
            <Link
              to="/"
              onClick={closeMenu}
              aria-current={isActive('/') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/'))}
            >
              🔍 Buscar vivienda
            </Link>
            <Link
              to="/favoritos"
              onClick={closeMenu}
              aria-current={isActive('/favoritos') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/favoritos'))}
            >
              <span>🧡 Favoritos</span>
              {favCount > 0 && <span className="bg-red-100 text-red-700 text-[11px] px-1.5 py-0.5 rounded-full" aria-label={`${favCount} favoritos`}>{favCount}</span>}
            </Link>
            <Link
              to="/comparar"
              onClick={closeMenu}
              aria-current={isActive('/comparar') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/comparar'))}
            >
              <span>⚖️ Comparar</span>
              <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full" aria-label={`${compCount} de ${compMax} para comparar`}>{compCount}/{compMax}</span>
            </Link>
            <Link
              to="/mis-publicaciones"
              onClick={closeMenu}
              aria-current={isActive('/mis-publicaciones') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/mis-publicaciones'))}
            >
              📢 Mis Publicaciones
            </Link>
            {(user?.rol || '').toUpperCase() === 'ADMIN' && (
              <Link
                to="/admin/dashboard"
                onClick={closeMenu}
                aria-current={isActive('/admin/dashboard') ? 'page' : undefined}
                className={mobileLinkCls(isActive('/admin/dashboard'))}
              >
                🛡️ Panel Admin
              </Link>
            )}
            <Link
              to="/publicar"
              onClick={closeMenu}
              aria-current={isActive('/publicar') ? 'page' : undefined}
              className="block w-full px-3 py-3 text-sm font-bold text-navy-900 bg-gold-400 rounded-xl text-center mt-1 min-h-[44px] transition-colors duration-200 hover:bg-gold-500 active:bg-gold-500"
            >
              + Publicar vivienda
            </Link>
            {sesionActiva && (
              <button type="button"
                onClick={() => { logout(); closeMenu() }}
                className="w-full px-3 py-3 mt-1 min-h-[44px] text-sm font-bold rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                🚪 Cerrar sesión
              </button>
            )}

          </div>
        </>
      )}
    </nav>
  )
}

function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-150 mt-auto">
      <div className="container-main py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <BrandMark size="sm" withText />
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Vivienda universitaria cercana al campus en Popayan. Encuentra tu lugar ideal con confianza.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-navy-800 mb-3">Plataforma</h4>
            <ul className="space-y-2">
              <li><Link to="/" className="text-sm text-neutral-500 hover:text-navy-700 transition-colors">Buscar vivienda</Link></li>
              <li><Link to="/favoritos" className="text-sm text-neutral-500 hover:text-navy-700 transition-colors">Favoritos</Link></li>
              <li><Link to="/comparar" className="text-sm text-neutral-500 hover:text-navy-700 transition-colors">Comparar</Link></li>
              <li><Link to="/publicar" className="text-sm text-neutral-500 hover:text-navy-700 transition-colors">Publicar</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-navy-800 mb-3">Informacion</h4>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Popayan, Cauca — Distancias estimadas a pie desde tu campus. MVP 2026.
            </p>
            <p className="text-xs text-neutral-400 mt-2">Sin pagos ni chat interno.</p>
          </div>
        </div>
        <div className="border-t border-neutral-150 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-neutral-400">2026 AlojaU. Todos los derechos reservados.</p>
          <p className="text-xs text-neutral-400 flex gap-3">
            <Link to="/terminos" className="hover:text-navy-600 underline">Términos</Link>
            <Link to="/privacidad" className="hover:text-navy-600 underline">Privacidad (Ley 1581)</Link>
            <span>Universidad del Cauca</span>
          </p>
        </div>
      </div>
    </footer>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <ScrollToTop />
      <AuthProvider>
        <FavoritosProvider>
          <CompararProvider>
            <div className="min-h-screen flex flex-col bg-neutral-50">
              <Nav />
              <ColdStartBanner />
              <main className="flex-1">
                {/* OLA4: fallback skeleton coherente con el resto de la app */}
                <Suspense fallback={
                  <div className="container-main py-12">
                    <div className="max-w-2xl mx-auto card p-8 animate-pulse space-y-4">
                      <div className="h-6 bg-neutral-200 rounded w-1/3" />
                      <div className="h-4 bg-neutral-200 rounded w-1/2" />
                      <div className="h-32 bg-neutral-100 rounded" />
                    </div>
                  </div>
                }>
                  <Routes>
                    <Route path="/" element={<Buscar />} />
                    <Route path="/publicacion/:id" element={<Detalle />} />
                    <Route path="/favoritos" element={<Favoritos />} />
                    <Route path="/comparar" element={<Comparar />} />
                    <Route path="/publicar" element={<Publicar />} />
                    <Route path="/perfil" element={<Perfil />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/recuperar" element={<Recuperar />} />
                    <Route path="/restablecer" element={<Restablecer />} />
                    <Route path="/terminos" element={<Terminos />} />
                    <Route path="/privacidad" element={<Privacidad />} />                    <Route path="/mis-publicaciones" element={<MisPublicaciones />} />
                    <Route path="/admin/dashboard" element={<ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>} />
                    <Route path="/admin/reportes" element={<ProtectedAdminRoute><AdminReportes /></ProtectedAdminRoute>} />
                    <Route path="/admin/tipos-vivienda" element={<ProtectedAdminRoute><AdminTipos /></ProtectedAdminRoute>} />
                  </Routes>
                </Suspense>
                <Toaster />

              </main>
              <Footer />
            </div>
          </CompararProvider>
        </FavoritosProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
export default App
