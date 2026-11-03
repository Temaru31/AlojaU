// Resultados paginados de la búsqueda con estados de carga, error y vacío.
import { Link } from 'react-router-dom'

import Card from '../../components/Card'
import { etiquetaLugar } from '../../components/CercanoA'
import Paginacion from '../../components/Paginacion'
import { GuardarAlerta } from '../Alertas'



export default function ResultadosBusqueda({ pubs, loading, error, total, page, pages, setPage, q, filtros, campusId, currentCampus, limpiarTodo }) {
  return (
    <div className="container-main py-6 md:py-8">

      <p className="text-xs text-neutral-400 mt-4" aria-live="polite">
        {loading ? 'Cargando...' : `${total} publicaciones · página ${page}/${pages}`}
      </p>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm mt-3" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-4 mb-5">
        <div>
          <p className="text-sm text-neutral-600">
            <span className="font-semibold text-navy-800">{pubs.length}</span> {pubs.length === 1 ? 'resultado' : 'resultados'}
            {currentCampus && (
              <span className="text-neutral-400">
                {' '}en {currentCampus.institucion ? `${currentCampus.institucion} - ` : ''}{currentCampus?.nombre_sede}
              </span>
            )}
          </p>
        </div>
        <GuardarAlerta filtros={filtros} campusId={campusId} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[420px]" role="status" aria-label="Cargando publicaciones" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-36 bg-neutral-100 rounded-t-lg" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-neutral-150 rounded w-24 mb-3" />
                <div className="h-5 bg-neutral-150 rounded w-3/4 mb-2" />
                <div className="h-4 bg-neutral-150 rounded w-1/2 mb-3" />
                <div className="h-3 bg-neutral-150 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : pubs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pubs.map(p => (
              <Link
                key={p.id}
                to={{ pathname: `/publicacion/${p.id}`, search: campusId ? `?campus_id=${campusId}` : '' }}
                className="block"
              >
                <Card pub={p} lugarNombre={currentCampus ? etiquetaLugar(currentCampus) : null} />
              </Link>
            ))}
          </div>
          <Paginacion page={page} pages={pages} total={total} onPage={setPage} />
        </>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-neutral-700 mb-1">No encontramos alojamientos que coincidan con tu búsqueda{q && <> para “{q}”</>}</p>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {q
              ? <>Intenta con “habitación”, “amoblado” o “cerca a la universidad”, revisa la ortografía o limpia los filtros.</>
              : <>Prueba otro lugar cercano o ajusta los filtros de búsqueda.</>}
          </p>
          <button
            type="button"
            onClick={limpiarTodo}
            className="mt-5 text-xs font-semibold text-navy-700 border border-navy-200 rounded-md px-4 py-2 hover:bg-navy-50 transition"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  )
}
