import { useState, useEffect } from 'react'
import {
  DIMENSIONES_ROOMIE,
  ENUMS_FALLBACK,
  extraerPreferenciasRoomie,
  empaquetarPreferenciasRoomie,
  calcularCompletitudRoomie,
  validarPreferenciasRoomie,
} from '../utils/preferenciasRoomie'
import { getEnumsPreferencias, guardarPreferenciasUsuario } from '../services/api'
import { notifyToast } from './Toast'
import { useAuth, emitAuthChange } from '../contexts/AuthContext'
import {
  Check,
  Sparkles,
  AlertCircle,
  Save,
  Clock,
  Moon,
  Sun,
  Utensils,
  PawPrint,
  Heart,
  Users,
  Info,
} from 'lucide-react'

export default function PreferenciasRoomie({ token, preferencias, onGuardado }) {
  const { actualizarUsuario } = useAuth()
  const [form, setForm] = useState(() => extraerPreferenciasRoomie(preferencias))
  const [catalogo, setCatalogo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [errores, setErrores] = useState({})

  // Carga catálogo dinámico del backend (fail-open hacia ENUMS_FALLBACK)
  useEffect(() => {
    let vivo = true
    getEnumsPreferencias()
      .then((res) => {
        if (vivo && res.data?.enums) {
          setCatalogo(res.data)
        }
      })
      .catch(() => {
        // En caso de fallo de red, los ENUMS_FALLBACK cubren el 100% de opciones
      })
    return () => {
      vivo = false
    }
  }, [])

  // Sincroniza si las preferencias del usuario cambian externamente
  useEffect(() => {
    setForm(extraerPreferenciasRoomie(preferencias))
    setSucio(false)
  }, [preferencias])

  const completitud = calcularCompletitudRoomie(form)

  const actualizarCampo = (campo, valor) => {
    setForm((prev) => {
      const next = { ...prev, [campo]: valor }
      // Validar al vuelo si modifica defectos u horas
      const val = validarPreferenciasRoomie(next)
      setErrores(val.errores)
      return next
    })
    setSucio(true)
  }

  const toggleLista = (campo, valor) => {
    setForm((prev) => {
      const actual = Array.isArray(prev[campo]) ? prev[campo] : []
      const existe = actual.includes(valor)
      const nextLista = existe ? actual.filter((item) => item !== valor) : [...actual, valor]
      const nextForm = { ...prev, [campo]: nextLista }
      const val = validarPreferenciasRoomie(nextForm)
      setErrores(val.errores)
      return nextForm
    })
    setSucio(true)
  }

  const handleGuardar = async (e) => {
    e?.preventDefault()
    const validacion = validarPreferenciasRoomie(form)
    if (!validacion.valido) {
      setErrores(validacion.errores)
      notifyToast('Por favor corrige los campos señalados antes de guardar', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = empaquetarPreferenciasRoomie(form)
      await guardarPreferenciasUsuario(payload, token)
      setSucio(false)
      notifyToast('Preferencias de convivencia guardadas con éxito', 'exito')
      // Actualizar el contexto global para que Roomies.jsx vea los datos frescos
      actualizarUsuario({ preferencias: payload })
      emitAuthChange()
      if (typeof onGuardado === 'function') {
        onGuardado(payload)
      }
    } catch {
      notifyToast('No se pudieron guardar las preferencias. Intenta de nuevo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Helper para leer opciones de un enum
  const obtenerOpciones = (nombreEnum) => {
    if (catalogo?.enums) {
      const hit = catalogo.enums.find((e) => e.nombre === nombreEnum)
      if (hit?.opciones) {
        // Excluir 'sin_dato' de los botones de selección activa
        return hit.opciones.filter((o) => o.valor !== 'sin_dato')
      }
    }
    return (ENUMS_FALLBACK[nombreEnum] || []).filter((o) => o.valor !== 'sin_dato')
  }

  return (
    <div className="space-y-6">
      {/* Banner Superior de Estado de Completitud */}
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

        {/* Barra de progreso visual */}
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

      <form onSubmit={handleGuardar} className="space-y-6">
        {/* ============================================================== */}
        {/* PUNTO 1: HIGIENE Y ORDEN */}
        {/* ============================================================== */}
        <section
          aria-labelledby="titulo-higiene"
          className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
        >
          <div className="border-b border-neutral-100 pb-3">
            <h3 id="titulo-higiene" className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-navy-700" aria-hidden="true" />
              1. {DIMENSIONES_ROOMIE[0].titulo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{DIMENSIONES_ROOMIE[0].descripcion}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Momento de aseo */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿En qué momento de la semana prefieres hacer aseo?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {obtenerOpciones('MomentoAseoSemana').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('aseo_momento_semana', opt.valor)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center transition min-h-[44px] flex items-center justify-center ${
                      form.aseo_momento_semana === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* Horario de aseo */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                Generalmente, ¿en qué horario haces el aseo?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {obtenerOpciones('HorarioAseo').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('aseo_horario', opt.valor)}
                    className={`px-2 py-2 rounded-xl text-xs font-medium border text-center transition min-h-[44px] flex items-center justify-center ${
                      form.aseo_horario === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* Estilo en la cocina */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿Cómo te consideras en la cocina?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {obtenerOpciones('EstiloCocina').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('cocina_estilo', opt.valor)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center transition min-h-[44px] flex items-center justify-center ${
                      form.cocina_estilo === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* Tiempo para lavar la loza */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿Cuánto tardas en lavar la loza o vajilla?
              </label>
              <div className="flex flex-col gap-2">
                {obtenerOpciones('TiempoLavarLoza').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('loza_tiempo', opt.valor)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition min-h-[40px] flex items-center ${
                      form.loza_tiempo === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* PUNTO 2: SOLVENCIA ECONÓMICA Y PAGOS */}
        {/* ============================================================== */}
        <section
          aria-labelledby="titulo-solvencia"
          className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
        >
          <div className="border-b border-neutral-100 pb-3">
            <h3 id="titulo-solvencia" className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-navy-700" aria-hidden="true" />
              2. {DIMENSIONES_ROOMIE[1].titulo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{DIMENSIONES_ROOMIE[1].descripcion}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Fuente de ingresos */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿Cuál es tu principal fuente de ingresos?
              </label>
              <div className="flex flex-col gap-2">
                {obtenerOpciones('FuenteIngresos').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('ingresos_fuente', opt.valor)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition min-h-[40px] flex items-center ${
                      form.ingresos_fuente === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* Estabilidad de ingresos */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿Qué tan estable es tu fuente de ingresos?
              </label>
              <div className="flex flex-col gap-2">
                {obtenerOpciones('EstabilidadIngresos').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('ingresos_estabilidad', opt.valor)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition min-h-[40px] flex items-center ${
                      form.ingresos_estabilidad === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* Puntualidad en pagos */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                ¿A la hora de pagar arriendo/facturas podrías ser puntual?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => actualizarCampo('pagos_puntual', true)}
                  className={`px-3 py-3 rounded-xl text-xs font-semibold border text-center transition min-h-[44px] flex items-center justify-center ${
                    form.pagos_puntual === true
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold ring-1 ring-emerald-600'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  Sí, siempre
                </button>
                <button
                  type="button"
                  onClick={() => actualizarCampo('pagos_puntual', false)}
                  className={`px-3 py-3 rounded-xl text-xs font-semibold border text-center transition min-h-[44px] flex items-center justify-center ${
                    form.pagos_puntual === false
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-600'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  A veces se me complica
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* PUNTO 3: PERSONALIDAD Y RESOLUCIÓN DE CONFLICTOS */}
        {/* ============================================================== */}
        <section
          aria-labelledby="titulo-personalidad"
          className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
        >
          <div className="border-b border-neutral-100 pb-3">
            <h3 id="titulo-personalidad" className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
              <Heart className="w-4 h-4 text-navy-700" aria-hidden="true" />
              3. {DIMENSIONES_ROOMIE[2].titulo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{DIMENSIONES_ROOMIE[2].descripcion}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rasgos positivos */}
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
              <h4 className="text-xs font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                Características Positivas (Fortalezas)
              </h4>
              <p className="text-[11px] text-emerald-700 mb-3">
                Selecciona las que mejor describan tu comportamiento diario:
              </p>
              <div className="flex flex-wrap gap-2">
                {obtenerOpciones('RasgoPositivo').map((opt) => {
                  const activa = form.rasgos_positivos.includes(opt.valor)
                  return (
                    <button
                      key={opt.valor}
                      type="button"
                      onClick={() => toggleLista('rasgos_positivos', opt.valor)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition min-h-[40px] flex items-center gap-1.5 ${
                        activa
                          ? 'border-emerald-600 bg-emerald-600 text-white font-bold'
                          : 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100/50'
                      }`}
                    >
                      {activa && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      {opt.etiqueta}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Rasgos negativos (defectos requeridos) */}
            <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                  Características Negativas (Defectos o áreas de mejora)
                </h4>
                <span className="text-[11px] font-bold text-amber-800 bg-amber-200/80 rounded-full px-2 py-0.5 shrink-0">
                  Mínimo 2 requeridos
                </span>
              </div>
              <p className="text-[11px] text-amber-700 mb-3">
                Reconocer nuestras debilidades asegura una convivencia transparente y armónica:
              </p>
              <div className="flex flex-wrap gap-2">
                {obtenerOpciones('RasgoNegativo').map((opt) => {
                  const activa = form.rasgos_negativos.includes(opt.valor)
                  return (
                    <button
                      key={opt.valor}
                      type="button"
                      onClick={() => toggleLista('rasgos_negativos', opt.valor)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition min-h-[40px] flex items-center gap-1.5 ${
                        activa
                          ? 'border-amber-700 bg-amber-700 text-white font-bold'
                          : 'border-amber-200 bg-white text-amber-900 hover:bg-amber-100/50'
                      }`}
                    >
                      {activa && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      {opt.etiqueta}
                    </button>
                  )
                })}
              </div>

              {errores.rasgos_negativos && (
                <p className="text-xs text-red-600 font-semibold mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {errores.rasgos_negativos}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* PUNTO 4: AFINIDAD EN EL ESTILO DE VIDA Y SUEÑO */}
        {/* ============================================================== */}
        <section
          aria-labelledby="titulo-sueno"
          className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
        >
          <div className="border-b border-neutral-100 pb-3">
            <h3 id="titulo-sueno" className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
              <Moon className="w-4 h-4 text-navy-700" aria-hidden="true" />
              4. {DIMENSIONES_ROOMIE[3].titulo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{DIMENSIONES_ROOMIE[3].descripcion}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Hora de dormir */}
            <div>
              <label htmlFor="hora_dormir" className="block text-xs font-semibold text-navy-800 mb-1.5">
                Hora habitual en que duermes
              </label>
              <div className="relative">
                <input
                  id="hora_dormir"
                  type="time"
                  value={form.sueno_hora_dormir}
                  onChange={(e) => actualizarCampo('sueno_hora_dormir', e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-navy-900 bg-white focus:border-navy-900 focus:outline-none min-h-[44px]"
                />
              </div>
              {errores.sueno_hora_dormir && (
                <p className="text-[11px] text-red-600 mt-1">{errores.sueno_hora_dormir}</p>
              )}
            </div>

            {/* Hora de despertar */}
            <div>
              <label htmlFor="hora_despertar" className="block text-xs font-semibold text-navy-800 mb-1.5">
                Hora habitual en que despiertas
              </label>
              <div className="relative">
                <input
                  id="hora_despertar"
                  type="time"
                  value={form.sueno_hora_despertar}
                  onChange={(e) => actualizarCampo('sueno_hora_despertar', e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-navy-900 bg-white focus:border-navy-900 focus:outline-none min-h-[44px]"
                />
              </div>
              {errores.sueno_hora_despertar && (
                <p className="text-[11px] text-red-600 mt-1">{errores.sueno_hora_despertar}</p>
              )}
            </div>

            {/* Tipo de horario de sueño */}
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-1.5">
                ¿Cómo describirías tu ritmo de sueño?
              </label>
              <div className="flex flex-col gap-2">
                {obtenerOpciones('TipoHorarioSueno').map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => actualizarCampo('sueno_tipo', opt.valor)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition min-h-[40px] flex items-center ${
                      form.sueno_tipo === opt.valor
                        ? 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {opt.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* PUNTO 5: NORMAS DE INVITADOS Y MASCOTAS */}
        {/* ============================================================== */}
        <section
          aria-labelledby="titulo-convivencia"
          className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
        >
          <div className="border-b border-neutral-100 pb-3">
            <h3 id="titulo-convivencia" className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-navy-700" aria-hidden="true" />
              5. {DIMENSIONES_ROOMIE[4].titulo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{DIMENSIONES_ROOMIE[4].descripcion}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tus planes personales */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-navy-800 uppercase tracking-wider">
                Tus planes de vida
              </h4>

              <div className="space-y-2">
                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
                  <span className="text-xs text-navy-900 font-medium">
                    ¿Tienes pareja sentimental que planeas invitar?
                  </span>
                  <input
                    type="checkbox"
                    checked={form.invitados_pareja === true}
                    onChange={(e) => actualizarCampo('invitados_pareja', e.target.checked)}
                    className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
                  <span className="text-xs text-navy-900 font-medium">
                    ¿Tienes mascotas o piensas llevar una?
                  </span>
                  <input
                    type="checkbox"
                    checked={form.mascotas === true}
                    onChange={(e) => actualizarCampo('mascotas', e.target.checked)}
                    className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
                  <span className="text-xs text-navy-900 font-medium">
                    ¿Planeas recibir invitados o visitas en varias ocasiones?
                  </span>
                  <input
                    type="checkbox"
                    checked={form.invitados_plan === true}
                    onChange={(e) => actualizarCampo('invitados_plan', e.target.checked)}
                    className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
                  />
                </label>
              </div>
            </div>

            {/* Tolerancia y filtros para matching */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-navy-800 uppercase tracking-wider flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 text-navy-600" aria-hidden="true" />
                Tolerancia de Convivencia (Filtros duros de Match)
              </h4>

              <div className="space-y-2">
                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
                  <span className="text-xs text-navy-900 font-medium">
                    ¿Aceptas convivir con mascotas de tu compañero?
                  </span>
                  <input
                    type="checkbox"
                    checked={form.acepta_mascotas === true}
                    onChange={(e) => actualizarCampo('acepta_mascotas', e.target.checked)}
                    className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
                  <span className="text-xs text-navy-900 font-medium">
                    ¿Aceptas que tu compañero invite a su pareja o amigos?
                  </span>
                  <input
                    type="checkbox"
                    checked={form.acepta_invitados === true}
                    onChange={(e) => actualizarCampo('acepta_invitados', e.target.checked)}
                    className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
                  />
                </label>
              </div>
              <p className="text-[11px] text-neutral-400 leading-tight">
                Nota: Si no aceptas mascotas o visitas, el motor de matching evitará emparejarte con
                quienes declaren tenerlas para prevenir roces.
              </p>
            </div>
          </div>
        </section>

        {/* Acciones flotantes / barra inferior */}
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
      </form>
    </div>
  )
}
