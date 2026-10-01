// Privacidad.jsx / ruta pública /privacidad — Ley 1581 de 2012.
import { Link } from 'react-router-dom'
import { POLITICA_COMPLETA, POLITICA_VERSION } from '../components/Legal'

export default function Privacidad() {
  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-2xl mx-auto card p-6 md:p-8">
        <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link to="/" className="hover:text-navy-600">Buscar</Link>
          <span aria-hidden="true">›</span>
          <span className="text-neutral-600">Política de Datos (Ley 1581)</span>
        </nav>
        <h1 className="font-display text-2xl font-bold text-navy-900 mb-1">
          Política de Tratamiento de Datos Personales
        </h1>
        <p className="text-xs text-neutral-400 mb-4">Ley 1581 de 2012 · Versión {POLITICA_VERSION}</p>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 font-sans">{POLITICA_COMPLETA}</pre>
      </div>
    </div>
  )
}
