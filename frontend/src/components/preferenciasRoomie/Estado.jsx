import { Check, Sparkles, Save, Info } from 'lucide-react'

/** Banner superior: porcentaje completado, aptitud para matching y barra de progreso. */
export function BannerCompletitud({ completitud }) {
  return (
    <div className="card rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-navy-900 to-navy-800 text-white shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-gold-400" aria-hidden="true" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Perfil de Convivencia y Roomie
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-xl">
            Configura tus hábitos cotidianos para que el algoritmo de afinidad te conecte con los
            compañeros de vivienda más compatibles.
          </p>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-navy-700/60 pt-3 sm:pt-0">
          <div className="text-left sm:text-right">
            <span className="text-2xl font-black text-gold-400">
              {completitud.porcentaje}%
            </span>
            <span className="text-xs text-neutral-300 ml-1">completado</span>
          </div>
          <div className="mt-1">
            {completitud.esAptoMatching ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> Apto para Match
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2.5 py-0.5">
                <Info className="w-3.5 h-3.5" aria-hidden="true" /> Datos pendientes
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="w-full bg-navy-950/60 rounded-full h-2 mt-4 overflow-hidden">
        <div
          className="bg-gold-400 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(5, completitud.porcentaje)}%` }}
          role="progressbar"
          aria-valuenow={completitud.porcentaje}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Porcentaje de perfil de convivencia completado"
        />
      </div>
    </div>
  )
}

/** Barra inferior: aviso de cambios sin guardar y botón de guardado. */
export function BarraGuardado({ sucio, saving }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      {sucio ? (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5"
          role="status"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
          Tienes cambios sin guardar
        </span>
      ) : (
        <span className="text-xs text-neutral-400">Tus cambios se encuentran al día.</span>
      )}

      <button
        type="submit"
        disabled={saving || !sucio}
        className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold transition min-h-[48px] ${
          sucio && !saving
            ? 'bg-gold-400 hover:bg-gold-500 text-navy-950 shadow-md active:scale-[0.98]'
            : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
        }`}
      >
        <Save className="w-4 h-4" aria-hidden="true" />
        {saving ? 'Guardando preferencias…' : 'Guardar preferencias de roomie'}
      </button>
    </div>
  )
}
