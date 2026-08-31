import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Buscar from './pages/Buscar'
import Detalle from './pages/Detalle'
import Publicar from './pages/Publicar'
import Comparar from './pages/Comparar'

// App con Router - cada HU es una ruta
// HU-001/002 -> /  (Buscar + Filtros)
// HU-003/007/008 -> /publicacion/:id (Detalle + Índice + WhatsApp)
// HU-004 -> /comparar
// HU-005/006 -> /publicar
function App() {
  return (
    <BrowserRouter>
      <nav className="bg-white shadow sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex gap-3 sm:gap-4 items-center min-w-0">
          <Link to="/" className="font-bold text-lg sm:text-xl text-indigo-600 shrink-0">AlojaU</Link>
          <div className="flex gap-3 sm:gap-4 items-center min-w-0">
            <Link to="/" className="text-xs sm:text-sm hover:underline truncate">Buscar</Link>
            <Link to="/comparar" className="text-xs sm:text-sm hover:underline truncate">Comparar</Link>
          </div>
          <Link to="/publicar" className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium shrink-0">Publicar</Link>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Buscar />} />
        <Route path="/publicacion/:id" element={<Detalle />} />
        <Route path="/comparar" element={<Comparar />} />
        <Route path="/publicar" element={<Publicar />} />
      </Routes>
      <footer className="text-center text-xs text-gray-400 py-6">
        Popayán, Cauca — MVP 2026 • Sin pagos ni chat interno • Solo distancia geodésica
      </footer>
    </BrowserRouter>
  )
}
export default App
