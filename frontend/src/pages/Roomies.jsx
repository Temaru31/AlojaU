import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCandidatosRoomies, api } from '../services/api'
import { authHead } from '../services/authHeaders'
import { calcularCompletitudRoomie, obtenerBandaCompatibilidad } from '../utils/preferenciasRoomie'
import { Users, Sparkles, SlidersHorizontal, ChevronRight, AlertCircle } from 'lucide-react'
import TarjetaCandidato from './roomies/TarjetaCandidato'
import ModalCompatibilidad from './roomies/ModalCompatibilidad'
import { CANDIDATOS_DEMO } from './roomies/candidatosDemo'

export default function Roomies() {
  const { user, token } = useAuth()
  const [candidatos, setCandidatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroBanda, setFiltroBanda] = useState('todas') // 'todas' | 'alta' | 'media'
  const [modalCandidato, setModalCandidato] = useState(null)
  const [modoDemo, setModoDemo] = useState(false)
  // Estado local para preferencias siempre frescas (evita depender del contexto estale)
  const [misPreferencias, setMisPreferencias] = useState(() => user?.preferencias || {})

  const miCompletitud = calcularCompletitudRoomie(misPreferencias)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      setLoading(true)
      try {
        // Cargar candidatos y perfil fresco en paralelo
        const [resCandidatos, resPerfil] = await Promise.allSettled([
          getCandidatosRoomies(token, { limite: 20 }),
          api.get('/api/auth/perfil', authHead(token)),
        ])

        if (!vivo) return

        // Actualizar preferencias con datos frescos del servidor
        if (resPerfil.status === 'fulfilled' && resPerfil.value?.data?.preferencias) {
          setMisPreferencias(resPerfil.value.data.preferencias)
        }

        if (resCandidatos.status === 'fulfilled') {
          const res = resCandidatos.value
          if (Array.isArray(res.data) && res.data.length > 0) {
            setCandidatos(res.data)
            setModoDemo(false)
          } else {
            setCandidatos(CANDIDATOS_DEMO)
            setModoDemo(true)
          }
        } else {
          // El endpoint 501 cae aquí: usamos candidatos demo estructurados
          setCandidatos(CANDIDATOS_DEMO)
          setModoDemo(true)
        }
      } catch {
        if (vivo) {
          setCandidatos(CANDIDATOS_DEMO)
          setModoDemo(true)
        }
      } finally {
        if (vivo) setLoading(false)
      }
    }

    if (token) {
      cargar()
    } else {
      setLoading(false)
    }

    return () => {
      vivo = false
    }
  }, [token])

  // Filtrado en cliente
  const candidatosFiltrados = candidatos.filter((c) => {
    const banda = obtenerBandaCompatibilidad(c.score).banda
    if (filtroBanda === 'alta' && banda !== 'alta') return false
    if (filtroBanda === 'media' && banda !== 'media') return false
    return true
  })

  // Mensaje para iniciar conversación por WhatsApp
  const generarUrlWhatsApp = (candidato) => {
    const rawTel = String(candidato.telefono_whatsapp || '').replace(/\D/g, '')
    const tel = rawTel.startsWith('57') ? rawTel : `57${rawTel}`
    const msg = encodeURIComponent(
      `¡Hola ${candidato.nombre_completo.split(' ')[0]}! Vi tu perfil de Roomie en AlojaU y tenemos un ${candidato.score}% de compatibilidad de convivencia. ¿Aún estás buscando alojamiento compartido?`,
    )
    return `https://wa.me/${tel}?text=${msg}`
  }

  return (
    <div className="container-main py-8 sm:py-10 space-y-8 animate-fade-in">
      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-neutral-150 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-400/20 text-navy-900 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5 text-gold-600" aria-hidden="true" />
            Matchmaking de Convivencia Estudiantil
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Compañeros de Habitación (Roomies)
          </h1>
          <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
            Encuentra estudiantes universitarios con hábitos de vida afines en aseo, horarios de
            sueño, convivencia y puntualidad para compartir arriendo en Popayán.
          </p>
        </div>

        {/* Tarjeta de estado de mis preferencias */}
        <div className="card rounded-2xl p-4 bg-white border border-neutral-200 shadow-sm shrink-0 flex items-center gap-4">
          <div>
            <span className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Tus hábitos
            </span>
            <span className="text-sm font-extrabold text-navy-900">
              {miCompletitud.porcentaje}% completado
            </span>
          </div>
          <Link
            to="/perfil#roomie"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-navy-900 hover:bg-navy-800 text-white transition min-h-[38px] flex items-center gap-1.5"
          >
            Editar hábitos <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Aviso educativo si el usuario aún no ha llenado sus hábitos */}
      {!miCompletitud.esAptoMatching && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 sm:p-6 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-bold text-amber-950">
                Mejora la precisión de tu compatibilidad
              </h2>
              <p className="text-xs text-amber-800 mt-0.5 max-w-xl">
                Aún no has completado tus hábitos esenciales (aseo, sueño y los 2 defectos requeridos).
                Completarlos te permitirá recibir emparejamientos calculados con mayor exactitud.
              </p>
            </div>
          </div>
          <Link
            to="/perfil#roomie"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shrink-0 min-h-[40px] flex items-center justify-center"
          >
            Configurar mis hábitos ahora
          </Link>
        </div>
      )}

      {/* Barra de Filtros Rápidos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-neutral-150 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1 pl-1 pr-2">
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Filtro:
          </span>
          <button
            type="button"
            onClick={() => setFiltroBanda('todas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition min-h-[36px] ${
              filtroBanda === 'todas'
                ? 'bg-navy-900 text-white font-bold'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Todos ({candidatos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroBanda('alta')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition min-h-[36px] ${
              filtroBanda === 'alta'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Alta afinidad (≥80%)
          </button>
          <button
            type="button"
            onClick={() => setFiltroBanda('media')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition min-h-[36px] ${
              filtroBanda === 'media'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Afinidad media (50-79%)
          </button>
        </div>

      </div>

      {modoDemo && (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Estos perfiles son ejemplos ilustrativos, no personas reales.</p>
          <p className="text-xs mt-0.5">
            Aún no hay compañeros compatibles disponibles (o el servicio no respondió). Completa tus hábitos
            de convivencia y vuelve más tarde para ver estudiantes reales.
          </p>
        </div>
      )}

      {/* Grid de Candidatos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card rounded-2xl p-6 bg-white border border-neutral-150 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-neutral-200" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-neutral-200 rounded w-1/3" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
              </div>
              <div className="h-16 bg-neutral-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : candidatosFiltrados.length === 0 ? (
        <div className="card rounded-2xl p-12 text-center bg-white border border-neutral-150 space-y-3">
          <Users className="w-10 h-10 text-neutral-300 mx-auto" aria-hidden="true" />
          <h3 className="text-base font-bold text-navy-900">No hay candidatos con este filtro</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Prueba seleccionando la opción &quot;Todos&quot; para ver compañeros en otras bandas de
            compatibilidad.
          </p>
          <button
            type="button"
            onClick={() => setFiltroBanda('todas')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-navy-900 text-white hover:bg-navy-800 transition min-h-[40px]"
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {candidatosFiltrados.map((cand) => (
            <TarjetaCandidato
              key={cand.id ?? cand.usuario_id}
              cand={cand}
              onVerDetalle={() => setModalCandidato(cand)}
              urlWhatsApp={generarUrlWhatsApp(cand)}
            />
          ))}
        </div>
      )}

      {/* Modal de Desglose de Hábitos y Compatibilidad */}
      {modalCandidato && (
        <ModalCompatibilidad
          candidato={modalCandidato}
          onCerrar={() => setModalCandidato(null)}
          urlWhatsApp={generarUrlWhatsApp(modalCandidato)}
        />
      )}
    </div>
  )
}
