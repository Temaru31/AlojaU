import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import Buscar from './pages/Buscar'
import Perfil from './pages/Perfil'
import MisPublicaciones from './pages/MisPublicaciones'
// Rutas pesadas diferidas (code-splitting). Buscar/Perfil/MisPublicaciones
// quedan eager (landing + auth críticas y livianas).
const Detalle = lazy(() => import('./pages/Detalle'))
const Publicar = lazy(() => import('./pages/Publicar'))
const Publicitar = lazy(() => import('./pages/Publicitar'))
const Comparar = lazy(() => import('./pages/Comparar'))
const Favoritos = lazy(() => import('./pages/Favoritos'))
const Alertas = lazy(() => import('./pages/Alertas'))
const AdminReportes = lazy(() => import('./pages/AdminReportes'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminTipos = lazy(() => import('./pages/AdminTipos'))
const Roomies = lazy(() => import('./pages/Roomies'))
// Enterprise Auth: OAuth callback, recovery y legal (Ley 1581).
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Recuperar = lazy(() => import('./pages/Recuperar'))
const Restablecer = lazy(() => import('./pages/Restablecer'))
const Terminos = lazy(() => import('./pages/Terminos'))
const Privacidad = lazy(() => import('./pages/Privacidad'))
// Chatbot MVP solo lectura: chunk separado, no pesa el bundle inicial.
const ChatWidget = lazy(() => import('./components/ChatWidget'))
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import ColdStartBanner from './components/ColdStartBanner'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toast'
import Footer from './components/Footer'
import Nav from './components/nav/Nav'
import useKeepAlive from './hooks/useKeepAlive'
import { FavoritosProvider } from './contexts/FavoritosContext'
import { CompararProvider } from './contexts/CompararContext'
import { AuthProvider } from './contexts/AuthContext'

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

function App() {
  // Heartbeat ligero anti cold-start (solo pestaña visible).
  // Nota: el hook vive aquí (raíz del Router) para cubrir toda la app.
  useKeepAlive()
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <ScrollToTop />
      <AuthProvider>
        <FavoritosProvider>
          <CompararProvider>
            <div className="min-h-screen min-h-dvh flex flex-col bg-neutral-50 pb-safe">
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
                    <Route path="/roomies" element={<Roomies />} />
                    <Route path="/publicar" element={<Publicar />} />
                    <Route path="/publicitar" element={<Publicitar />} />
                    <Route path="/perfil" element={<Perfil />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/recuperar" element={<Recuperar />} />
                    <Route path="/restablecer" element={<Restablecer />} />
                    <Route path="/terminos" element={<Terminos />} />
                    <Route path="/privacidad" element={<Privacidad />} />
                    <Route path="/mis-publicaciones" element={<MisPublicaciones />} />
                    <Route path="/alertas" element={<Alertas />} />
                    <Route path="/admin/dashboard" element={<ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>} />
                    <Route path="/admin/reportes" element={<ProtectedAdminRoute><AdminReportes /></ProtectedAdminRoute>} />
                    <Route path="/admin/tipos-vivienda" element={<ProtectedAdminRoute><AdminTipos /></ProtectedAdminRoute>} />
                  </Routes>
                </Suspense>
                <Toaster />

              </main>
              <Suspense fallback={null}>
                <ChatWidget />
              </Suspense>
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
