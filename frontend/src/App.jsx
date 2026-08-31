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
      <nav className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4 items-center">
          <Link to="/" className="font-bold text-xl text-indigo-600">AlojaU</Link>
          <Link to="/" className="text-sm hover:underline">Buscar</Link>
          <Link to="/comparar" className="text-sm hover:underline">Comparar</Link>
          <Link to="/publicar" className="ml-auto bg-indigo-600 text-white px-4 py-2 rounded text-sm">Publicar</Link>
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
