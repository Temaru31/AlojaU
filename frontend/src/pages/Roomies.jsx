import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, inicialesDe } from '../contexts/AuthContext'
import { getCandidatosRoomies, api } from '../services/api'
import {
  calcularCompletitudRoomie,
  obtenerBandaCompatibilidad,
  obtenerEtiquetaOpcion,
} from '../utils/preferenciasRoomie'
import {
  Users,
  Sparkles,
  Heart,
  SlidersHorizontal,
  Clock,
  Utensils,
  Moon,
  PawPrint,
  Check,
  ChevronRight,
  X,
  MessageCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

// Candidatos demo con datos realistas para cuando el backend está en desarrollo/mockup
export const CANDIDATOS_DEMO = [
  {
    usuario_id: 101,
    nombre_completo: 'Valentina Muñoz',
    email: 'vmunoz@unicauca.edu.co',
    telefono_whatsapp: '3128904561',
    carrera: 'Ingeniería de Sistemas',
    bio: 'Estudiante de 6to semestre. Busco ambiente tranquilo para estudiar, responsable con el aseo y puntual con los servicios.',
    score: 94,
    detalle: { aseo: 1.0, sueno: 0.95, invitados: 1.0, pagos: 1.0, caracter: 0.85 },
    preferencias: {
      'roomie.aseo_momento_semana': 'entre_semana',
      'roomie.aseo_horario': 'manana_6am_11am',
      'roomie.cocina_estilo': 'organizado',
      'roomie.loza_tiempo': 'inmediatamente',
      'roomie.sueno_hora_dormir': '23:00',
      'roomie.sueno_hora_despertar': '06:30',
      'roomie.sueno_tipo': 'estable',
      'roomie.ingresos_fuente': 'respaldo_familiar',
      'roomie.ingresos_estabilidad': 'estable',
      'roomie.pagos_puntual': true,
      'roomie.rasgos_positivos': ['respetuoso', 'tranquilo'],
      'roomie.rasgos_negativos': ['impaciente', 'malhumorado'],
      'roomie.mascotas': false,
      'roomie.acepta_mascotas': true,
      'roomie.invitados_plan': false,
      'roomie.acepta_invitados': true,
    },
  },
  {
    usuario_id: 102,
    nombre_completo: 'Carlos Andrés Rivera',
    email: 'crivera@unicauca.edu.co',
    telefono_whatsapp: '3147890123',
    carrera: 'Medicina',
    bio: 'Interno de medicina. Suelo tener horarios rotativos pero soy muy silencioso y ordenado. No fumo.',
    score: 86,
    detalle: { aseo: 0.9, sueno: 0.8, invitados: 0.9, pagos: 1.0, caracter: 0.8 },
    preferencias: {
      'roomie.aseo_momento_semana': 'fin_de_semana',
      'roomie.aseo_horario': 'tarde_12pm_6pm',
      'roomie.cocina_estilo': 'organizado',
      'roomie.loza_tiempo': 'inmediatamente',
      'roomie.sueno_hora_dormir': '23:30',
      'roomie.sueno_hora_despertar': '06:00',
      'roomie.sueno_tipo': 'estable',
      'roomie.ingresos_fuente': 'trabajo_fijo',
      'roomie.ingresos_estabilidad': 'estable',
      'roomie.pagos_puntual': true,
      'roomie.rasgos_positivos': ['respetuoso', 'paciente'],
      'roomie.rasgos_negativos': ['impaciente', 'terco_orgulloso'],
      'roomie.mascotas': false,
      'roomie.acepta_mascotas': true,
      'roomie.invitados_plan': false,
      'roomie.acepta_invitados': true,
    },
  },
  {
    usuario_id: 103,
    nombre_completo: 'Mariana Gómez',
    email: 'mgomez@unicauca.edu.co',
    telefono_whatsapp: '3104567890',
    carrera: 'Diseño Gráfico',
    bio: 'Amante de las plantas y los perros. Me gusta cocinar y compartir charlas amenas, pero respeto el espacio personal.',
    score: 78,
    detalle: { aseo: 0.8, sueno: 0.75, invitados: 0.85, pagos: 0.8, caracter: 0.85 },
    preferencias: {
      'roomie.aseo_momento_semana': 'entre_semana',
      'roomie.aseo_horario': 'tarde_12pm_6pm',
      'roomie.cocina_estilo': 'organizado',
      'roomie.loza_tiempo': 'a_lo_largo_del_dia',
      'roomie.sueno_hora_dormir': '00:00',
      'roomie.sueno_hora_despertar': '07:30',
      'roomie.sueno_tipo': 'variable',
      'roomie.ingresos_fuente': 'trabajo_independiente_emprendimiento',
      'roomie.ingresos_estabilidad': 'variable',
      'roomie.pagos_puntual': true,
      'roomie.rasgos_positivos': ['buena_vibra', 'tranquilo'],
      'roomie.rasgos_negativos': ['malhumorado', 'terco_orgulloso'],
      'roomie.mascotas': true,
      'roomie.acepta_mascotas': true,
      'roomie.invitados_plan': true,
      'roomie.acepta_invitados': true,
    },
  },
  {
    usuario_id: 104,
    nombre_completo: 'Sebastián Caicedo',
    email: 'scaicedo@unicauca.edu.co',
    telefono_whatsapp: '3189012345',
    carrera: 'Derecho',
    bio: 'Estudiante de 8vo semestre. Paso mucho tiempo en biblioteca, enfocado en preparatorios.',
    score: 68,
    detalle: { aseo: 0.7, sueno: 0.7, invitados: 0.65, pagos: 0.7, caracter: 0.75 },
    preferencias: {
      'roomie.aseo_momento_semana': 'fin_de_semana',
      'roomie.aseo_horario': 'noche_7pm_9pm',
      'roomie.cocina_estilo': 'desorganizado',
      'roomie.loza_tiempo': 'otro_dia_cuando_se_necesite',
      'roomie.sueno_hora_dormir': '01:00',
      'roomie.sueno_hora_despertar': '08:00',
      'roomie.sueno_tipo': 'variable',
      'roomie.ingresos_fuente': 'respaldo_familiar',
      'roomie.ingresos_estabilidad': 'estable',
      'roomie.pagos_puntual': true,
      'roomie.rasgos_positivos': ['paciente', 'buena_vibra'],
      'roomie.rasgos_negativos': ['bajo_manejo_frustracion', 'terco_orgulloso'],
      'roomie.mascotas': false,
      'roomie.acepta_mascotas': false,
      'roomie.invitados_plan': false,
      'roomie.acepta_invitados': false,
    },
  },
]

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
          api.get('/api/auth/perfil', { headers: { Authorization: `Bearer ${token}` } }),
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

        {modoDemo && (
          <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-100 px-2.5 py-1 rounded-full self-start sm:self-center">
            Modo demostración activo
          </span>
        )}
      </div>

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
          {candidatosFiltrados.map((cand) => {
            const candidatoId = cand.id ?? cand.usuario_id
            const banda = obtenerBandaCompatibilidad(cand.score)
            const detalle = cand.detalle || null
            const tieneDetalle = Boolean(detalle && Object.keys(detalle).length > 0)
            const tienePreferencias = Boolean(cand.preferencias && Object.keys(cand.preferencias).length > 0)

            return (
              <div
                key={candidatoId}
                className="card rounded-2xl p-5 sm:p-6 bg-white border border-neutral-150 shadow-sm hover:shadow-md transition space-y-5 flex flex-col justify-between"
              >
                {/* Cabecera del Candidato */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="w-12 h-12 rounded-full bg-navy-900 text-white text-sm font-bold flex items-center justify-center shrink-0 border border-neutral-200 shadow-sm"
                    >
                      {inicialesDe({ nombre_completo: cand.nombre_completo })}
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-navy-950 leading-tight">
                        {cand.nombre_completo}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {cand.carrera || 'Estudiante universitario'} {cand.email ? `· ${cand.email}` : '· Popayán'}
                      </p>
                    </div>
                  </div>

                  {/* Insignia de Score de Afinidad */}
                  <div
                    className={`inline-flex flex-col items-end px-3 py-1.5 rounded-xl border font-bold text-xs shrink-0 ${banda.badgeClass}`}
                  >
                    <span className="text-sm font-black">{cand.score}%</span>
                    <span className="text-[10px] font-medium leading-none">{banda.etiqueta}</span>
                  </div>
                </div>

                {/* Presentación / Bio */}
                {cand.bio && (
                  <p className="text-xs text-neutral-600 bg-neutral-50/70 p-3 rounded-xl border border-neutral-100 leading-relaxed italic">
                    &ldquo;{cand.bio}&rdquo;
                  </p>
                )}

                {/* Desglose visual por 5 dimensiones (solo si viene en la respuesta) */}
                {tieneDetalle && (
                  <div className="space-y-2 pt-1 border-t border-neutral-100">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600">
                      <span>Afinidad por dimensiones:</span>
                      <span className="text-navy-900 font-bold">{cand.score}/100</span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 text-center">
                      <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                        <Utensils className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
                        <span className="block text-[10px] text-neutral-500">Aseo</span>
                        <span className="text-[11px] font-bold text-navy-900">
                          {Math.round((detalle.aseo ?? 1) * 100)}%
                        </span>
                      </div>

                      <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                        <Moon className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
                        <span className="block text-[10px] text-neutral-500">Sueño</span>
                        <span className="text-[11px] font-bold text-navy-900">
                          {Math.round((detalle.sueno ?? 1) * 100)}%
                        </span>
                      </div>

                      <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                        <Users className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
                        <span className="block text-[10px] text-neutral-500">Visitas</span>
                        <span className="text-[11px] font-bold text-navy-900">
                          {Math.round((detalle.invitados ?? 1) * 100)}%
                        </span>
                      </div>

                      <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                        <Clock className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
                        <span className="block text-[10px] text-neutral-500">Pagos</span>
                        <span className="text-[11px] font-bold text-navy-900">
                          {Math.round((detalle.pagos ?? 1) * 100)}%
                        </span>
                      </div>

                      <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                        <Heart className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
                        <span className="block text-[10px] text-neutral-500">Carácter</span>
                        <span className="text-[11px] font-bold text-navy-900">
                          {Math.round((detalle.caracter ?? 0.8) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Acciones de Contacto */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                  {tienePreferencias && (
                    <button
                      type="button"
                      onClick={() => setModalCandidato(cand)}
                      className="w-full sm:w-1/2 px-3 py-2.5 rounded-xl text-xs font-semibold text-navy-800 bg-neutral-100 hover:bg-neutral-200 transition min-h-[44px] flex items-center justify-center gap-1.5"
                    >
                      Ver hábitos completos
                    </button>
                  )}

                  {cand.telefono_whatsapp ? (
                    <a
                      href={generarUrlWhatsApp(cand)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full ${tienePreferencias ? 'sm:w-1/2' : ''} px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm`}
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      Contactar WhatsApp
                    </a>
                  ) : (
                    <span className={`w-full ${tienePreferencias ? 'sm:w-1/2' : ''} text-center text-xs text-neutral-400 py-2.5`}>
                      Sin WhatsApp público
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Desglose de Hábitos y Compatibilidad */}
      {modalCandidato && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-match"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-fade-in"
        >
          <div
            className="fixed inset-0"
            onClick={() => setModalCandidato(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl z-10 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Cabecera del Modal */}
            <div className="flex items-start justify-between border-b border-neutral-150 pb-4">
              <div>
                <span className="text-[11px] font-bold text-gold-600 uppercase tracking-wider">
                  Detalle de Convivencia
                </span>
                <h3 id="titulo-modal-match" className="text-lg font-bold text-navy-950">
                  {modalCandidato.nombre_completo}
                </h3>
                <p className="text-xs text-neutral-500">
                  Compatibilidad general:{' '}
                  <span className="font-bold text-navy-900">{modalCandidato.score}%</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalCandidato(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Comparativa de Hábitos */}
            <div className="space-y-4 text-xs">
              {/* Higiene */}
              <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
                <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
                  Higiene y Cocina
                </h4>
                <div className="grid grid-cols-2 gap-2 text-neutral-600">
                  <div>
                    <span className="block text-[10px] text-neutral-400">Aseo semanal:</span>
                    <span className="font-semibold text-navy-900">
                      {obtenerEtiquetaOpcion(
                        'MomentoAseoSemana',
                        modalCandidato.preferencias?.['roomie.aseo_momento_semana'],
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Horario de aseo:</span>
                    <span className="font-semibold text-navy-900">
                      {obtenerEtiquetaOpcion(
                        'HorarioAseo',
                        modalCandidato.preferencias?.['roomie.aseo_horario'],
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">En la cocina:</span>
                    <span className="font-semibold text-navy-900">
                      {obtenerEtiquetaOpcion(
                        'EstiloCocina',
                        modalCandidato.preferencias?.['roomie.cocina_estilo'],
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Lavar loza:</span>
                    <span className="font-semibold text-navy-900">
                      {obtenerEtiquetaOpcion(
                        'TiempoLavarLoza',
                        modalCandidato.preferencias?.['roomie.loza_tiempo'],
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Horarios de sueño */}
              <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
                <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
                  Horarios y Descanso
                </h4>
                <div className="grid grid-cols-3 gap-2 text-neutral-600">
                  <div>
                    <span className="block text-[10px] text-neutral-400">Duerme hacia:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.sueno_hora_dormir'] || 'Sin dato'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Despierta hacia:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.sueno_hora_despertar'] || 'Sin dato'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Ritmo de sueño:</span>
                    <span className="font-semibold text-navy-900">
                      {obtenerEtiquetaOpcion(
                        'TipoHorarioSueno',
                        modalCandidato.preferencias?.['roomie.sueno_tipo'],
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visitas y Mascotas */}
              <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
                <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
                  <PawPrint className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
                  Visitas y Mascotas
                </h4>
                <div className="grid grid-cols-2 gap-2 text-neutral-600">
                  <div>
                    <span className="block text-[10px] text-neutral-400">Tiene mascotas:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.mascotas'] ? 'Sí' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Acepta mascotas:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.acepta_mascotas'] ? 'Sí' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Planea visitas:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.invitados_plan'] ? 'Sí' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400">Acepta visitas:</span>
                    <span className="font-semibold text-navy-900">
                      {modalCandidato.preferencias?.['roomie.acepta_invitados'] ? 'Sí' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón inferior en modal */}
            <div className="pt-2">
              {modalCandidato.telefono_whatsapp ? (
                <a
                  href={generarUrlWhatsApp(modalCandidato)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-3 rounded-2xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition min-h-[44px] flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  Iniciar conversación por WhatsApp
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalCandidato(null)}
                  className="w-full px-4 py-3 rounded-2xl text-xs font-bold text-navy-900 bg-neutral-100 hover:bg-neutral-200 transition min-h-[44px]"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
