import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import Card from '../components/Card'
import { useFavoritos } from '../contexts/FavoritosContext'

export default function Favoritos() {
  const { favoritos, clear } = useFavoritos()
  const [pubs, setPubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [fallidos, setFallidos] = useState([])

  useEffect(() => {
    let cancelled = false
    if (favoritos.length === 0) {
      setPubs([])
      setFallidos([])
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.allSettled(favoritos.map(id => api.get(`/api/publicaciones/${id}`).then(r => r.data)))
      .then(results => {
        if (cancelled) return
        const ok = []
        const fail = []
        results.forEach((res, i) => {
          if (res.status === 'fulfilled' && res.value?.id) ok.push(res.value)
          else fail.push(favoritos[i])
        })
        setPubs(ok)
        setFallidos(fail)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [favoritos])

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600 transition-colors">Buscar</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-neutral-600">Favoritos</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight">
            Mis favoritos
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1" aria-live="polite">
            {loading ? 'Cargando…' : `${favoritos.length} guardado${favoritos.length === 1 ? '' : 's'} en este dispositivo`}
          </p>
        </div>
        {favoritos.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-neutral-500 hover:text-red-600 border border-neutral-200 hover:border-red-200 rounded-md px-3 py-2 transition self-start sm:self-auto"
          >
            Limpiar todos
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-36 bg-neutral-100 rounded-t-lg" />
              <div className="p-4 space-y-2">
                <div className="h-5 bg-neutral-150 rounded w-3/4" />
                <div className="h-4 bg-neutral-150 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : favoritos.length === 0 ? (
        <div className="card p-12 text-center max-w-md mx-auto">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl" aria-hidden="true">♡</span>
          </div>
          <p className="font-medium text-neutral-700 mb-1">Aún no guardas nada</p>
          <p className="text-xs text-neutral-400 mb-5">Toca el corazón en cualquier aviso para verlo aquí y comparar después.</p>
          <Link to="/" className="btn-accent text-sm">Ir a buscar vivienda</Link>
        </div>
      ) : (
        <>
          {fallidos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md p-3 text-xs mb-4" role="alert">
              {fallidos.length} aviso{fallidos.length === 1 ? '' : 's'} ya no disponible{fallidos.length === 1 ? '' : 's'} (ID {fallidos.join(', ')}).
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pubs.map(p => (
              <Link key={p.id} to={`/publicacion/${p.id}`} className="block">
                <Card pub={p} />
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-6">
            <Link to="/comparar" className="btn-secondary text-sm">Abrir comparador</Link>
            <Link to="/" className="text-sm text-navy-600 hover:text-navy-800 font-medium px-3 py-2.5">Seguir buscando →</Link>
          </div>
        </>
      )}
    </div>
  )
}
