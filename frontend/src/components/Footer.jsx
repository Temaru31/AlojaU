import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'

const ENLACES_PLATAFORMA = [
  { to: '/', texto: 'Buscar vivienda' },
  { to: '/favoritos', texto: 'Favoritos' },
  { to: '/comparar', texto: 'Comparar' },
  { to: '/roomies', texto: 'Buscar roomie' },
  { to: '/publicar', texto: 'Publicar' },
]

export default function Footer() {
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
              {ENLACES_PLATAFORMA.map(({ to, texto }) => (
                <li key={to}><Link to={to} className="text-sm text-neutral-500 hover:text-navy-700 transition-colors">{texto}</Link></li>
              ))}
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
