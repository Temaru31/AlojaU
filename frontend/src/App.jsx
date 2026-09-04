import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Buscar from './pages/Buscar'
import Detalle from './pages/Detalle'
import Publicar from './pages/Publicar'
import Comparar from './pages/Comparar'

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  return (
    <nav className="bg-white border-b border-neutral-150 sticky top-0 z-50">
      <div className="container-main">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-navy-800 rounded-md flex items-center justify-center">
                <span className="text-gold-400 font-display font-bold text-sm">A</span>
              </div>
              <span className="font-display font-bold text-lg text-navy-900 tracking-tight">
                Aloja<span className="text-gold-500">U</span>
              </span>
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
                Comparar
              </Link>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/publicar" className="btn-accent">
              Publicar
            </Link>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-neutral-500 hover:text-navy-700"
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
      {mobileOpen && (
        <div className="md:hidden border-t border-neutral-150 bg-white">
          <div className="container-main py-3 space-y-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2.5 text-sm font-medium rounded-md ${
                isActive('/') ? 'text-navy-800 bg-navy-50' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Buscar vivienda
            </Link>
            <Link
              to="/comparar"
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2.5 text-sm font-medium rounded-md ${
                isActive('/comparar') ? 'text-navy-800 bg-navy-50' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Comparar
            </Link>
            <Link
              to="/publicar"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 text-sm font-semibold text-navy-900 bg-gold-400 rounded-md text-center mt-2"
            >
              Publicar vivienda
            </Link>
          </div>
        </div>
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
              <div className="w-7 h-7 bg-navy-800 rounded-md flex items-center justify-center">
                <span className="text-gold-400 font-display font-bold text-xs">A</span>
              </div>
              <span className="font-display font-bold text-navy-900">Aloja<span className="text-gold-500">U</span></span>
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
              Popayan, Cauca — Distancia geodesica (Haversine). MVP 2026.
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
      <div className="min-h-screen flex flex-col bg-neutral-50">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Buscar />} />
            <Route path="/publicacion/:id" element={<Detalle />} />
            <Route path="/comparar" element={<Comparar />} />
            <Route path="/publicar" element={<Publicar />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
export default App
