import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import Card from '../components/Card'
import Filtros from '../components/Filtros'

export default function Buscar() {
  const [campus, setCampus] = useState([])
  const [campusId, setCampusId] = useState(1)
  const [filtros, setFiltros] = useState({})
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/campus')
      .then(r => setCampus(r.data))
      .catch(() => setCampus([{ id: 1, nombre_sede: 'Campus Tulcan' }]))
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get('/api/publicaciones', {
      params: {
        campus_id: campusId,
        precio_min: filtros.min || undefined,
        precio_max: filtros.max || undefined,
      },
    })
      .then(r => setPubs(r.data))
      .catch(() => setPubs([]))
      .finally(() => setLoading(false))
  }, [campusId, filtros])

  const currentCampus = campus.find(c => c.id == campusId)

  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="container-main relative py-14 md:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full mb-5">
              <div className="w-1.5 h-1.5 bg-gold-400 rounded-full" />
              <span className="text-xs font-medium text-gold-300 tracking-wide uppercase">Popayan, Cauca</span>
            </div>
            <h1 className="font-display text-3xl md:text-[2.75rem] font-extrabold text-white leading-tight tracking-tight mb-4 text-balance">
              Encuentra tu vivienda<br />
              <span className="text-gold-400">cerca del campus</span>
            </h1>
            <p className="text-navy-300 text-base md:text-lg leading-relaxed max-w-lg">
              Compara opciones, revisa el indice de confianza y contacta directamente por WhatsApp.
            </p>
          </div>
        </div>
      </section>

      {/* Buscador */}
      <section className="bg-white border-b border-neutral-150 sticky top-16 z-40">
        <div className="container-main py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Campus</label>
              <select
                value={campusId}
                onChange={e => setCampusId(e.target.value)}
                className="select-field"
              >
                {campus.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.institucion ? `${c.institucion} - ${c.nombre_sede}` : c.nombre_sede}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 sm:flex-initial">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Rango de precio</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  className="input-field"
                  value={filtros.min || ''}
                  onChange={e => setFiltros({ ...filtros, min: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Max"
                  className="input-field"
                  value={filtros.max || ''}
                  onChange={e => setFiltros({ ...filtros, max: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filtros + Resultados */}
      <div className="container-main py-6 md:py-8">
        <Filtros filtros={filtros} setFiltros={setFiltros} />

        <div className="flex items-center justify-between mt-6 mb-5">
          <div>
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-navy-800">{pubs.length}</span> {pubs.length === 1 ? 'resultado' : 'resultados'}
              {currentCampus && (
                <span className="text-neutral-400">
                  {' '}en {currentCampus.institucion ? `${currentCampus.institucion} - ` : ''}{currentCampus?.nombre_sede}
                </span>
              )}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">Distancia geodesica (Haversine)</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-4 bg-neutral-150 rounded w-24 mb-3" />
                <div className="h-5 bg-neutral-150 rounded w-3/4 mb-2" />
                <div className="h-4 bg-neutral-150 rounded w-1/2 mb-3" />
                <div className="h-3 bg-neutral-150 rounded w-full" />
              </div>
            ))}
          </div>
        ) : pubs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pubs.map(p => (
              <Link key={p.id} to={`/publicacion/${p.id}`} className="block">
                <Card pub={p} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-700 mb-1">Sin resultados</p>
            <p className="text-xs text-neutral-400">Prueba otro campus o ajusta los filtros de busqueda</p>
          </div>
        )}
      </div>
    </div>
  )
}
