// Favoritos.jsx — Consulta de publicaciones guardadas por el estudiante.
// Persistido en localStorage a través de FavoritosContext (sin requerir cuenta).
// Consulta en tiempo real la vigencia real de cada publicación:
// Si no está en estado ACTIVO, expiró o no existe (404), se presenta con badge rojo "No vigente"
// y el contacto por WhatsApp queda deshabilitado.
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useFavoritos } from '../contexts/FavoritosContext'
import SmartImage from '../components/SmartImage'
import { formatDistancia } from '../utils/formatters'

const TIPO_LABEL = {
  HABITACION_INDEPENDIENTE: 'Habitación independiente',
  HABITACION_FAMILIAR: 'Habitación familiar',
  APARTAESTUDIO: 'Apartaestudio',
  COMPARTIDO: 'Compartido',
}

export default function Favoritos() {
  const { ids, remove, clear, count } = useFavoritos()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // Consulta en paralelo los datos frescos de cada publicación favorita
  useEffect(() => {
    if (!ids || ids.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    let isMounted = true
    setLoading(true)

    const fetchPromises = ids.map(async (id) => {
      try {
        const res = await api.get(`/api/publicaciones/${id}`)
        const pub = res.data

        const ahora = new Date()
        const vencidaPorFecha = pub.fecha_expiracion
          ? new Date(pub.fecha_expiracion).getTime() < ahora.getTime()
          : false
        const noActivo = pub.estado !== 'ACTIVO'
        const noVigente = noActivo || vencidaPorFecha

        return {
          id: pub.id,
          titulo: pub.titulo,
          tipo_inmueble: pub.tipo_inmueble,
          zona_nombre: pub.zona_nombre || pub.zona,
          canon_mensual: pub.canon_mensual ?? pub.canon,
          distancia_geodesica_m: pub.distancia_geodesica_m ?? pub.dist_m,
          indice_confianza: pub.indice_confianza ?? pub.indice,
          fotos: pub.fotos || [],
          whatsapp_url: pub.whatsapp_url,
          telefono_whatsapp: pub.telefono_whatsapp,
          estado: pub.estado,
          fecha_expiracion: pub.fecha_expiracion,
          noVigente,
          inexistente: false,
        }
      } catch {
        // Si el backend responde 404 (eliminada o no ACTIVA) o error de red:
        // Se conserva una referencia visible marcada como "No vigente"
        return {
          id,
          titulo: `Publicación #${id}`,
          tipo_inmueble: 'No disponible',
          zona_nombre: 'Aviso retirado o inactivo',
          canon_mensual: null,
          fotos: [],
          noVigente: true,
          inexistente: true,
        }
      }
    })

    Promise.all(fetchPromises).then((results) => {
      if (isMounted) {
        setItems(results)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [ids])

  // Manejador para limpiar todos los favoritos
  const handleLimpiar = () => {
    if (window.confirm('¿Seguro que deseas eliminar todos tus favoritos guardados?')) {
      clear()
    }
  }

  return (
    <div className="container-main py-6 md:py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Favoritos</span>
      </nav>

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 flex items-center gap-2">
            <span>Mis Favoritos</span>
            <span className="text-red-500 text-lg">♥</span>
            {count > 0 && (
              <span className="text-sm font-normal text-neutral-400">({count})</span>
            )}
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Viviendas guardadas en tu navegador para revisar en cualquier momento.
          </p>
        </div>

        {count > 0 && (
          <button
            onClick={handleLimpiar}
            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 transition shrink-0"
          >
            Limpiar favoritos
          </button>
        )}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-0 overflow-hidden animate-pulse">
              <div className="h-44 bg-neutral-150" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-neutral-150 rounded w-1/3" />
                <div className="h-5 bg-neutral-150 rounded w-3/4" />
                <div className="h-4 bg-neutral-150 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : count === 0 ? (
        /* Estado vacío */
        <div className="card p-12 text-center max-w-md mx-auto my-8">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-400 flex items-center justify-center text-2xl mx-auto mb-4">
            ♡
          </div>
          <h2 className="text-base font-semibold text-navy-900 mb-1">
            No tienes favoritos guardados
          </h2>
          <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
            Explora las opciones de vivienda disponibles y presiona el ícono de corazón para guardarlas aquí y revisarlas después.
          </p>
          <Link to="/" className="btn-accent text-sm inline-flex items-center gap-2">
            <span>Explorar publicaciones</span>
            <span>→</span>
          </Link>
        </div>
      ) : (
        /* Cuadrícula de favoritos */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((pub) => {
              const cover = pub.fotos && pub.fotos.length > 0 ? pub.fotos[0] : null
              const tipo = TIPO_LABEL[pub.tipo_inmueble] || pub.tipo_inmueble || 'Vivienda'
              const zona = pub.zona_nombre || 'Zona no informada'

              return (
                <article
                  key={pub.id}
                  className="card p-0 overflow-hidden flex flex-col justify-between hover:shadow-md transition group relative"
                >
                  {/* Imagen y Badges */}
                  <div className="h-44 bg-neutral-100 relative overflow-hidden shrink-0">
                    {cover ? (
                      <SmartImage
                        src={cover}
                        alt={pub.titulo}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-navy-50/50 text-navy-300">
                        <span className="text-2xl mb-1 opacity-50">🏠</span>
                        <span className="text-xs text-neutral-400 font-medium">Sin imagen</span>
                      </div>
                    )}

                    {/* Badge "No vigente" (rojo prominente cuando no está activa o expiró) */}
                    {pub.noVigente ? (
                      <span className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md">
                        No vigente
                      </span>
                    ) : (
                      pub.indice_confianza != null && (
                        <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-navy-800 text-[11px] font-semibold px-2 py-0.5 rounded-md border border-neutral-200">
                          {pub.indice_confianza}/100 confianza
                        </span>
                      )
                    )}

                    {/* Botón rápido para quitar de favoritos */}
                    <button
                      onClick={() => remove(pub.id)}
                      aria-label={`Quitar ${pub.titulo} de favoritos`}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm text-red-500 hover:bg-white hover:text-red-700 shadow flex items-center justify-center text-sm transition"
                      title="Quitar de favoritos"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Contenido de la tarjeta */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      {/* Meta: Tipo y Zona */}
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
                        <span className="font-semibold text-navy-800">{tipo}</span>
                        <span>•</span>
                        <span className="truncate">{zona}</span>
                      </div>

                      {/* Título */}
                      <h2 className="text-sm font-semibold text-navy-900 line-clamp-2 group-hover:text-navy-700 transition" title={pub.titulo}>
                        {pub.titulo}
                      </h2>

                      {/* Distancia si existe */}
                      {pub.distancia_geodesica_m != null && (
                        <p className="text-xs text-neutral-400 mt-1">
                          {formatDistancia(pub.distancia_geodesica_m)} al campus
                        </p>
                      )}

                      {/* Canon */}
                      <p className="text-sm font-bold text-navy-900 mt-2">
                        {pub.canon_mensual != null
                          ? `$${Number(pub.canon_mensual).toLocaleString('es-CO')} COP/mes`
                          : pub.inexistente
                            ? 'Aviso no disponible'
                            : 'Canon no informado'}
                      </p>
                    </div>

                    {/* Bloque de Contacto / Acciones */}
                    <div className="pt-3 border-t border-neutral-100 space-y-2">
                      {/* Botón WhatsApp: Bloqueado/No disponible si está "No vigente" */}
                      {pub.noVigente ? (
                        <div className="w-full py-2 px-3 bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-400 text-xs text-center font-medium">
                          Contacto por WhatsApp no disponible
                        </div>
                      ) : pub.whatsapp_url ? (
                        <a
                          href={pub.whatsapp_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                          <span>Contactar por WhatsApp</span>
                        </a>
                      ) : null}

                      {/* Botones de acción: Ver detalle y Quitar */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          onClick={() => remove(pub.id)}
                          className="text-xs text-red-600 hover:text-red-700 hover:underline font-medium py-1"
                        >
                          Quitar
                        </button>

                        {!pub.inexistente && (
                          <Link
                            to={`/publicacion/${pub.id}`}
                            className="text-xs text-navy-700 hover:text-navy-900 font-semibold py-1 hover:underline"
                          >
                            Ver detalle →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
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
