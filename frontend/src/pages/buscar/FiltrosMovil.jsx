// Móvil: cápsula [buscar | filtros] y bottom sheet con todos los filtros.
import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'

import CercanoA from '../../components/CercanoA'
import CiudadSelector from '../../components/CiudadSelector'
import { SERVICIOS_OPCIONES, AtajosPresupuesto } from '../../components/Filtros'
import useFocusTrap from '../../hooks/useFocusTrap'
import SearchBar from '../../components/SearchBar'

import { BloqueTipos, BloqueServicios } from '../buscar/BloquesFiltro'

export default function FiltrosMovil({ busqueda }) {
  const {
    campus, campusId, setCampusId, ciudades, ciudadId, setCiudadId,
    q, setQ, filtros, setFiltros, numAvanzados, total, limpiarTodo,
  } = busqueda
  // Bottom sheet de filtros solo en móvil (<768px).
  const [sheetAbierto, setSheetAbierto] = useState(false)
  // Tab cicla dentro del sheet + foco vuelve al botón Filtros.
  const sheetRef = useRef(null)
  useFocusTrap(sheetRef, sheetAbierto)

  // Cierra el sheet con Escape y bloquea el scroll del fondo mientras abre.
  useEffect(() => {
    if (!sheetAbierto) return
    const onKey = (e) => { if (e.key === 'Escape') setSheetAbierto(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [sheetAbierto])

  return (
    <>
      <div className="md:hidden sticky top-16 z-30">
        <div className="container-main pt-2">
          <div className="flex items-center gap-2 rounded-full bg-white border border-neutral-150 shadow-md pl-1 pr-1 py-1">
            <div className="flex-1 min-w-0">
              <SearchBar value={q} onChange={setQ} placeholder="Buscar zona…" />
            </div>
            <button
              type="button"
              onClick={() => setSheetAbierto(true)}
              aria-label={`Abrir filtros${numAvanzados > 0 ? `, ${numAvanzados} activos` : ''}`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-navy-800 text-white text-xs font-bold px-3.5 py-2.5"
            >
              <Settings aria-hidden="true" className="w-4 h-4" /> Filtros
              {numAvanzados > 0 && (
                <span className="inline-flex items-center rounded-full bg-gold-400 px-1.5 py-px text-[10px] font-bold text-navy-900" aria-hidden="true">
                  {numAvanzados}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {sheetAbierto && (
        <div ref={sheetRef} className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filtros de búsqueda">
          <div aria-hidden="true" onClick={() => setSheetAbierto(false)} className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px] transition-opacity duration-150" />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-3xl bg-white shadow-2xl animar-subir">
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-neutral-300" />
            <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-neutral-100">
              <p className="text-sm font-bold text-navy-900">
                Filtros
                {numAvanzados > 0 && <span className="ml-2 text-[11px] font-bold text-navy-700 bg-navy-50 rounded-full px-2 py-0.5">{numAvanzados} activos</span>}
              </p>
              <button
                type="button"
                onClick={() => setSheetAbierto(false)}
                aria-label="Cerrar filtros"
                className="w-11 h-11 rounded-full text-neutral-500 hover:bg-neutral-100 active:bg-neutral-100 flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 space-y-5">
              {/* 1 · Ubicación / sector. */}
              <section aria-labelledby="f-ubica-m" className="space-y-3">
                <p className="text-xs font-bold text-navy-800" id="f-ubica-m">1 · Ubicación</p>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5" htmlFor="cercano-a-m">Cercano a…</label>
                  <CercanoA lugares={campus} value={campusId} onChange={setCampusId} inputId="cercano-a-m" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5" htmlFor="ciudad-m">Ciudad</label>
                  <CiudadSelector value={ciudadId} onChange={setCiudadId} inputId="ciudad-m" ciudades={ciudades} />
                </div>
              </section>
              {/* 2 · Tipo de inmueble: ÚNICA fuente (catálogo dinámico).
                  Sin <select> nativo: en Android el popup lo pinta el OS en
                  modo oscuro y rompe el sistema de diseño. */}
              <section aria-labelledby="f-tipo-m" className="space-y-2">
                <p className="text-xs font-bold text-navy-800" id="f-tipo-m">2 · Tipo de inmueble</p>
                <BloqueTipos filtros={filtros} setFiltros={setFiltros} />
              </section>
              {/* 3 · Presupuesto: atajos + min/max en un solo bloque (el
                  atajo escribe los inputs; pulsar el activo lo limpia).
                  Mismo componente que el drawer desktop (paridad). */}
              <section aria-labelledby="f-pres-m" className="space-y-2">
                <p className="text-xs font-bold text-navy-800" id="f-pres-m">3 · Presupuesto (COP)</p>
                <AtajosPresupuesto filtros={filtros} setFiltros={setFiltros} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="f-min-m" className="sr-only">Precio mínimo en COP</label>
                    <input
                      id="f-min-m"
                      type="number"
                      placeholder="Mín COP"
                      value={filtros.min || ''}
                      onChange={(e) => setFiltros({ ...filtros, min: e.target.value })}
                      min="0"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-max-m" className="sr-only">Precio máximo en COP</label>
                    <input
                      id="f-max-m"
                      type="number"
                      placeholder="Máx COP"
                      value={filtros.max || ''}
                      onChange={(e) => setFiltros({ ...filtros, max: e.target.value })}
                      min="0"
                      className="input-field"
                    />
                  </div>
                </div>
              </section>
              {/* 4 · Servicios: colapsable a partir de 6 (escala sin saturar). */}
              <BloqueServicios
                items={SERVICIOS_OPCIONES}
                filtros={filtros}
                setFiltros={setFiltros}
              />
            </div>
            {/* F4 barra de acción flotante con conteo en vivo (con salida
                explícita para limpiar y copy honesto en cero). */}
            <div className="p-4 pt-3 border-t border-neutral-100 bg-white/95 backdrop-blur rounded-b-3xl shadow-[0_-8px_24px_rgba(12,20,38,0.08)] flex gap-2">
              <button
                type="button"
                onClick={limpiarTodo}
                aria-label="Limpiar todos los filtros"
                className="shrink-0 min-h-[52px] px-4 rounded-2xl border border-neutral-200 text-xs font-bold text-neutral-600 active:bg-neutral-50 transition"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => setSheetAbierto(false)}
                className="btn-accent flex-1 justify-center !py-3.5 !rounded-2xl !text-sm active:scale-[0.99] transition"
              >
                {total === 0 ? 'Cerrar y ajustar' : `Mostrar ${total} alojamiento${total === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
