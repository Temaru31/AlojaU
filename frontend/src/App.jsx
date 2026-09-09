import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Buscar from './pages/Buscar'
import Detalle from './pages/Detalle'
import Publicar from './pages/Publicar'
import Comparar from './pages/Comparar'
import Perfil from './pages/Perfil'
import AdminReportes from './pages/AdminReportes'
import MisPublicaciones from './pages/MisPublicaciones'
import ColdStartBanner from './components/ColdStartBanner'
import BrandMark from './components/BrandMark'
import { FavoritosProvider, useFavoritos } from './contexts/FavoritosContext'
import { CompararProvider, useComparar } from './contexts/CompararContext'
import { AuthProvider, useAuth, inicialesDe } from './contexts/AuthContext'

function Nav() {
  const { count: favCount } = useFavoritos()
  const { count: compCount, max: compMax } = useComparar()
  const { token, user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  const closeMenu = () => setMobileOpen(false)
  const closeUser = () => setUserOpen(false)
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
    `flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-200 ${
      active ? 'text-navy-800 bg-navy-50' : 'text-neutral-600 hover:bg-neutral-100'
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
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive('/') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                }`}
              >
                Buscar
              </Link>
              <Link
                to="/comparar"
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive('/comparar') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                }`}
              >
                Comparar {compCount > 0 && <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full ml-1">{compCount}/{compMax}</span>}
              </Link>
              <Link
                to="/perfil"
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive('/perfil') ? 'text-navy-800 bg-navy-50' : 'text-neutral-500 hover:text-navy-700 hover:bg-neutral-100'
                }`}
              >
                Mi Perfil
              </Link>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {favCount > 0 && <span className="text-sm text-neutral-500" aria-label={`${favCount} favoritos`}>♡ {favCount}</span>}
            {/* UX: navbar según sesión */}
            {!token ? (
              <Link to="/perfil" className="px-3 py-2 text-sm font-medium rounded-md text-neutral-500 hover:text-navy-700 hover:bg-neutral-100 transition-colors">
                Mi Perfil / Iniciar Sesión
              </Link>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setUserOpen(!userOpen)}
                  aria-label="Menú de usuario"
                  aria-expanded={userOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-neutral-200 hover:border-navy-300 hover:bg-neutral-50 transition"
                >
                  <span aria-hidden="true" className="w-8 h-8 rounded-full bg-navy-800 text-white text-xs font-bold flex items-center justify-center">
                    {inicialesDe(user)}
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
                      <button
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
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            className="md:hidden p-2 text-neutral-500 hover:text-navy-700 rounded-md transition-colors duration-200"
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
            <Link
              to="/"
              onClick={closeMenu}
              aria-current={isActive('/') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/'))}
            >
              Buscar vivienda
            </Link>
            <Link
              to="/comparar"
              onClick={closeMenu}
              aria-current={isActive('/comparar') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/comparar'))}
            >
              <span>Comparar</span>
              <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full" aria-label={`${compCount} de ${compMax} para comparar`}>{compCount}/{compMax}</span>
            </Link>
            <Link
              to="/"
              onClick={closeMenu}
              aria-label={`Favoritos, ${favCount} guardados`}
              className={mobileLinkCls(false)}
            >
              <span>Favoritos</span>
              <span className="bg-red-50 text-red-600 text-[11px] px-1.5 py-0.5 rounded-full">♡ {favCount}</span>
            </Link>
            <Link
              to="/perfil"
              onClick={closeMenu}
              aria-current={isActive('/perfil') ? 'page' : undefined}
              className={mobileLinkCls(isActive('/perfil'))}
            >
              {token ? (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-6 h-6 rounded-full bg-navy-800 text-white text-[10px] font-bold flex items-center justify-center">
                    {inicialesDe(user)}
                  </span>
                  <span className="truncate max-w-40">{displayName}</span>
                </span>
              ) : 'Mi Perfil / Iniciar Sesión'}
            </Link>
            {token && (
              <>
                <Link
                  to="/mis-publicaciones"
                  onClick={closeMenu}
                  aria-current={isActive('/mis-publicaciones') ? 'page' : undefined}
                  className={mobileLinkCls(isActive('/mis-publicaciones'))}
                >
                  Mis Publicaciones
                </Link>
                <button
                  onClick={() => { logout(); closeMenu() }}
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold rounded-md text-red-600 hover:bg-red-50 transition-colors"
                >
                  Cerrar sesión
                </button>
              </>
            )}
            <Link
              to="/publicar"
              onClick={closeMenu}
              aria-current={isActive('/publicar') ? 'page' : undefined}
              className="block w-full px-3 py-2.5 text-sm font-semibold text-navy-900 bg-gold-400 rounded-md text-center mt-1 transition-colors duration-200 hover:bg-gold-500"
            >
              Publicar vivienda
            </Link>

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
          <p className="text-xs text-neutral-400">Universidad del Cauca</p>
        </div>
      </div>
    </footer>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <FavoritosProvider>
        <CompararProvider>
          <div className="min-h-screen flex flex-col bg-neutral-50">
            <Nav />
            <ColdStartBanner />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Buscar />} />
                <Route path="/publicacion/:id" element={<Detalle />} />
                <Route path="/comparar" element={<Comparar />} />
                <Route path="/publicar" element={<Publicar />} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/mis-publicaciones" element={<MisPublicaciones />} />
                <Route path="/admin/reportes" element={<AdminReportes />} />
              </Routes>

            </main>
            <Footer />
          </div>
        </CompararProvider>
      </FavoritosProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
export default App
