// Acciones del aviso: favorito, comparar, reportar y editar (dueño).

import { Check, Flag, Heart, Pencil, Plus } from 'lucide-react'
import BotonCompartir from '../../components/BotonCompartir'















export default function AccionesAviso({ pub, acciones }) {
  const { esDueno, isFav, isComp, handleToggleFav, handleToggleComp, setEditando, setReportOpen } = acciones
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button"
        onClick={handleToggleFav}
        aria-pressed={isFav}
        className={`hidden sm:inline-flex sm:items-center sm:gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 ${isFav ? 'bg-red-500 text-white border-red-500' : 'bg-white border-neutral-200 hover:bg-neutral-50'}`}
      >
        {isFav ? (<><Heart aria-hidden="true" className="w-4 h-4 fill-current" /> En favoritos</>) : (<><Heart aria-hidden="true" className="w-4 h-4" /> Añadir a favoritos</>)}
      </button>
      <button type="button"
        onClick={handleToggleComp}
        aria-pressed={isComp}
        className={`hidden sm:inline-flex sm:items-center sm:gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition active:scale-95 ${isComp ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-neutral-200 hover:bg-neutral-50'}`}
      >
        {isComp ? (<><Check aria-hidden="true" className="w-4 h-4" /> En comparar</>) : (<><Plus aria-hidden="true" className="w-4 h-4" /> Comparar (máx 3)</>)}
      </button>
      <span className="hidden sm:inline-block">
        <BotonCompartir
          titulo={`${pub.titulo} en AlojaU`}
          url={typeof window !== 'undefined' ? window.location.href : `/publicacion/${pub.id}`}
          etiqueta="Compartir aviso"
        />
      </span>
      {/* UX: reportar visible en cabecera (secundario discreto, no escondido bajo el mapa) */}
      <button type="button"
        onClick={() => setReportOpen(true)}
        aria-label="Reportar este aviso"
        className="px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition bg-white border-neutral-200 text-neutral-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 inline-flex items-center gap-1.5"
      >
        <Flag aria-hidden="true" className="w-4 h-4" /> Reportar aviso
      </button>
      {/* v15.2 acceso directo del dueño (verificado por usuario_id). */}
      {esDueno && (
        <button type="button"
          onClick={() => setEditando(true)}
          aria-label={`Editar ${pub.titulo}`}
          className="px-3 py-1.5 rounded-full text-xs sm:text-sm border font-medium transition bg-navy-800 border-navy-800 text-white hover:bg-navy-900 inline-flex items-center gap-1.5"
        >
          <Pencil aria-hidden="true" className="w-4 h-4" /> Editar publicación
        </button>
      )}
    </div>
  )
}
