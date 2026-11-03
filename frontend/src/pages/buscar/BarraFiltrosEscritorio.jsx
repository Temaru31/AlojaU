// Desktop: barra flotante de filtros en una sola fila (solapa el hero).

import { SlidersHorizontal, X } from 'lucide-react'

import CercanoA from '../../components/CercanoA'
import CiudadSelector from '../../components/CiudadSelector'
import { PanelPrimario, MasFiltrosModal } from '../../components/Filtros'

import SearchBar from '../../components/SearchBar'




export default function BarraFiltrosEscritorio({ busqueda, avanzadosAbiertos, setAvanzadosAbiertos }) {
  const {
    campus, campusId, setCampusId, ciudades, ciudadId, setCiudadId,
    q, setQ, filtros, setFiltros, numAvanzados, total, limpiarTodo,
  } = busqueda

  return (
    <div className="hidden md:block sticky top-16 z-30">
      <div className="container-main">
        <div className="relative -mt-7 rounded-2xl bg-white border border-neutral-150 shadow-lg p-3">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
            <div className="flex-[1.6] min-w-0">
              {/* SearchBar ya expone aria-label="Buscar publicaciones por texto". */}
              <SearchBar value={q} onChange={setQ} />
            </div>
            <div className="flex-1 min-w-0 lg:max-w-60">
              <label className="sr-only" htmlFor="cercano-a">Cercano a</label>
              <CercanoA lugares={campus} value={campusId} onChange={setCampusId} inputId="cercano-a" />
            </div>
            <div className="flex-1 min-w-0 lg:max-w-52">
              <label className="sr-only" htmlFor="ciudad">Ciudad</label>
              <CiudadSelector value={ciudadId} onChange={setCiudadId} inputId="ciudad" ciudades={ciudades} />
            </div>
            <button
              type="button"
              onClick={() => setAvanzadosAbiertos((v) => !v)}
              aria-expanded={avanzadosAbiertos}
              aria-controls="panel-avanzados"
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition bg-navy-800 text-white border-navy-800 hover:bg-navy-900"
            >
              <SlidersHorizontal aria-hidden="true" className="w-4 h-4" /> Filtros
              {numAvanzados > 0 && (
                <span className="inline-flex items-center rounded-full bg-gold-400 px-2 py-0.5 text-[11px] font-bold text-navy-900" aria-label={`${numAvanzados} filtros activos`}>
                  {numAvanzados}
                </span>
              )}
              <span aria-hidden="true" className={`text-[10px] transition-transform ${avanzadosAbiertos ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {/* Limpiar siempre a la vista (sin desplegar nada) cuando hay filtros.
                Reseteo TOTAL (filtros + ubicación + texto): parcial dejaba
                valores huérfanos que el snapshot resucitaba. */}
            {numAvanzados > 0 && (
              <button
                type="button"
                onClick={limpiarTodo}
                aria-label="Limpiar filtros"
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-neutral-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
              >
                <X aria-hidden="true" className="w-4 h-4" /> Limpiar
              </button>
            )}
          </div>
          {avanzadosAbiertos && (
            <div id="panel-avanzados" className="mt-3 border-t border-neutral-100 pt-3 space-y-3">
              {/* M4: primarios inline (texto ya arriba + precio/tipo/principales aquí) */}
              <PanelPrimario filtros={filtros} setFiltros={setFiltros} />
              <div className="flex items-center gap-2">
                <MasFiltrosModal filtros={filtros} setFiltros={setFiltros} totalResultados={total} onLimpiar={limpiarTodo} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
