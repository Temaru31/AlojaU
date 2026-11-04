// Detalle en desktop: título, precio, total del primer mes y frescura.

import { Eye } from 'lucide-react'






















export default function CabeceraDetalle({ pub, canon, deposito, totalPrimerMes, actualizadoHace, desactualizada }) {
  return (
    <div className="hidden sm:block">
      <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
        {pub.titulo}
      </h1>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 mb-2">
        {actualizadoHace && <span>Actualizado {actualizadoHace}</span>}
        {typeof pub.vistas === 'number' && (
          <span aria-label={`${pub.vistas} vistas`} className="inline-flex items-center gap-1">· <Eye aria-hidden="true" className="w-4 h-4" /> {pub.vistas} {pub.vistas === 1 ? 'vista' : 'vistas'}</span>
        )}
        {desactualizada && (
          <span className="font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-300">
            Desactualizada
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-bold text-navy-800">
          {canon != null ? `$${Number(canon).toLocaleString('es-CO')}` : 'No informado'}
        </span>
        <span className="text-sm text-neutral-400">COP/mes</span>
        {deposito == null ? (
          <span className="text-xs text-neutral-400 ml-2">· Depósito no informado</span>
        ) : deposito > 0 ? (
          <span className="text-xs text-neutral-500 ml-2">
            + depósito ${Number(deposito).toLocaleString('es-CO')}
          </span>
        ) : (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-2">
            Sin depósito
          </span>
        )}
      </div>
      {totalPrimerMes != null && (
        <p className="text-xs text-neutral-500 mt-1">
          Total primer mes: <span className="font-semibold text-navy-800">${Number(totalPrimerMes).toLocaleString('es-CO')} COP</span>
          <span className="text-neutral-400"> (canon + depósito)</span>
        </p>
      )}
    </div>
  )
}
