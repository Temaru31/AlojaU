import { Link } from 'react-router-dom'
import { ArrowRight, Heart, House } from 'lucide-react'

// Pestaña Mis Publicaciones: totales del dueño y accesos directos.
export default function AvisosTab({ misStats }) {
  return (
      <div id="panel-avisos" role="tabpanel" aria-labelledby="tab-avisos" aria-label="Mis publicaciones y favoritos" tabIndex={0} className="space-y-4">
        {misStats && (
          <div className="grid grid-cols-3 gap-2" aria-label="Resumen de mis publicaciones">
            <div className="rounded-lg bg-neutral-50 border border-neutral-150 p-3 text-center">
              <p className="text-xl font-bold text-navy-800">{misStats.total}</p>
              <p className="text-[11px] text-neutral-500">Avisos</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{misStats.activas}</p>
              <p className="text-[11px] text-neutral-500">Publicados</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{misStats.pendientes}</p>
                <p className="text-[11px] text-neutral-500">En revisión</p>
        </div>
      </div>
    )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/mis-publicaciones" className="card rounded-2xl p-5 hover:border-navy-300 transition block shadow-sm">
            <p className="text-sm font-semibold text-navy-800 flex items-center gap-1.5"><House aria-hidden="true" className="w-4 h-4" /> Mis publicaciones</p>
            <p className="text-xs text-neutral-500 mt-1">Crea, edita y renueva tus avisos.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-navy-700">Abrir <ArrowRight aria-hidden="true" className="w-4 h-4" /></span>
          </Link>
          <Link to="/favoritos" className="card rounded-2xl p-5 hover:border-navy-300 transition block shadow-sm">
            <p className="text-sm font-semibold text-navy-800 flex items-center gap-1.5"><Heart aria-hidden="true" className="w-4 h-4" /> Favoritos</p>
            <p className="text-xs text-neutral-500 mt-1">Tus alojamientos guardados.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-navy-700">Abrir <ArrowRight aria-hidden="true" className="w-4 h-4" /></span>
          </Link>
        </div>
      </div>
  )
}
