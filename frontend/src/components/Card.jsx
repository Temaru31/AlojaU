import { getLabelIndice } from '../utils/formatters'

export default function Card({ pub }) {
  const level = pub.indice_confianza >= 80 ? 'high' : pub.indice_confianza >= 50 ? 'mid' : 'low'

  const badgeStyles = {
    high: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    mid: 'bg-gold-50 text-gold-700 border border-gold-200',
    low: 'bg-orange-50 text-orange-700 border border-orange-200',
  }

  const dotStyles = {
    high: 'bg-emerald-500',
    mid: 'bg-gold-500',
    low: 'bg-orange-500',
  }

  return (
    <div className="card-hover group p-0 overflow-hidden">
      {/* Image placeholder */}
      <div className="h-36 bg-gradient-to-br from-navy-50 to-neutral-100 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-10 h-10 text-navy-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
          </svg>
        </div>
        {/* Confidence badge */}
        <div className={`absolute top-3 left-3 badge ${badgeStyles[level]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[level]}`} />
          {pub.indice_confianza} — {getLabelIndice(pub.indice_confianza)}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-display font-semibold text-navy-900 text-sm leading-snug line-clamp-2 group-hover:text-navy-600 transition-colors">
            {pub.titulo}
          </h3>
        </div>

        <p className="text-lg font-bold text-navy-800 mb-3">
          ${pub.canon?.toLocaleString()} <span className="text-xs font-normal text-neutral-400">COP/mes</span>
        </p>

        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {pub.zona}
          </span>
          <span className="text-neutral-300">|</span>
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            {pub.dist_m}m
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
          <span className="text-xs text-neutral-400">{pub.fotos} fotos</span>
          <span className="text-neutral-300">·</span>
          <span className="text-xs text-emerald-600 font-medium">Activo</span>
        </div>
      </div>
    </div>
  )
}
