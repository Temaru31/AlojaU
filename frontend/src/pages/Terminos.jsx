// Terminos.jsx / ruta pública /terminos — texto legal completo.
import { Link } from 'react-router-dom'
import { TERMINOS_COMPLETOS } from '../components/Legal'

export default function Terminos() {
  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-2xl mx-auto card p-6 md:p-8">
        <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link to="/" className="hover:text-navy-600">Buscar</Link>
          <span aria-hidden="true">›</span>
          <span className="text-neutral-600">Términos de Servicio</span>
        </nav>
        <h1 className="font-display text-2xl font-bold text-navy-900 mb-4">Términos de Servicio</h1>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 font-sans">{TERMINOS_COMPLETOS}</pre>
      </div>
    </div>
  )
}
