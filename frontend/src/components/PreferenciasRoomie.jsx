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
import { Check, AlertCircle, Clock, Moon, Utensils, PawPrint, Heart, Users } from 'lucide-react'
import {
  OpcionesUnicas,
  SiNo,
  ChipsMultiples,
  CampoHora,
  Casilla,
  SeccionDimension,
  ErrorCampo,
} from './preferenciasRoomie/Campos'
import { BannerCompletitud, BarraGuardado } from './preferenciasRoomie/Estado'

/** Opciones de un enum del catálogo (o del fallback), sin 'sin_dato'. */
function opcionesDe(catalogo, nombreEnum) {
  const hit = catalogo?.enums?.find((e) => e.nombre === nombreEnum)
  const opciones = hit?.opciones || ENUMS_FALLBACK[nombreEnum] || []
  return opciones.filter((o) => o.valor !== 'sin_dato')
}

function useCatalogoEnums() {
  const [catalogo, setCatalogo] = useState(null)
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
  return catalogo
}

export default function PreferenciasRoomie({ token, preferencias, onGuardado }) {
  const { actualizarUsuario } = useAuth()
  const [form, setForm] = useState(() => extraerPreferenciasRoomie(preferencias))
  const catalogo = useCatalogoEnums()
  const [saving, setSaving] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [errores, setErrores] = useState({})

  // Sincroniza si las preferencias del usuario cambian externamente
  useEffect(() => {
    setForm(extraerPreferenciasRoomie(preferencias))
    setSucio(false)
  }, [preferencias])

  const completitud = calcularCompletitudRoomie(form)
  const opciones = (nombreEnum) => opcionesDe(catalogo, nombreEnum)

  // Aplica un cambio y valida al vuelo (defectos mínimos, horas).
  const cambiarForm = (calcular) => {
    setForm((prev) => {
      const next = calcular(prev)
      setErrores(validarPreferenciasRoomie(next).errores)
      return next
    })
    setSucio(true)
  }

  const actualizarCampo = (campo, valor) => cambiarForm((prev) => ({ ...prev, [campo]: valor }))

  const toggleLista = (campo, valor) =>
    cambiarForm((prev) => {
      const actual = Array.isArray(prev[campo]) ? prev[campo] : []
      const nextLista = actual.includes(valor) ? actual.filter((item) => item !== valor) : [...actual, valor]
      return { ...prev, [campo]: nextLista }
    })

  const campo = (nombre) => ({ valor: form[nombre], onElegir: (v) => actualizarCampo(nombre, v) })
  const casilla = (nombre) => ({ marcada: form[nombre], onCambiar: (v) => actualizarCampo(nombre, v) })

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

  return (
    <div className="space-y-6">
      <BannerCompletitud completitud={completitud} />

      <form onSubmit={handleGuardar} className="space-y-6">
        <SeccionDimension id="titulo-higiene" numero={1} dimension={DIMENSIONES_ROOMIE[0]} Icono={Utensils}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <OpcionesUnicas
              pregunta="¿En qué momento de la semana prefieres hacer aseo?"
              opciones={opciones('MomentoAseoSemana')}
              {...campo('aseo_momento_semana')}
            />
            <OpcionesUnicas
              pregunta="Generalmente, ¿en qué horario haces el aseo?"
              opciones={opciones('HorarioAseo')}
              disposicion="grid3"
              {...campo('aseo_horario')}
            />
            <OpcionesUnicas
              pregunta="¿Cómo te consideras en la cocina?"
              opciones={opciones('EstiloCocina')}
              {...campo('cocina_estilo')}
            />
            <OpcionesUnicas
              pregunta="¿Cuánto tardas en lavar la loza o vajilla?"
              opciones={opciones('TiempoLavarLoza')}
              disposicion="lista"
              {...campo('loza_tiempo')}
            />
          </div>
        </SeccionDimension>

        <SeccionDimension id="titulo-solvencia" numero={2} dimension={DIMENSIONES_ROOMIE[1]} Icono={Clock}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <OpcionesUnicas
              pregunta="¿Cuál es tu principal fuente de ingresos?"
              opciones={opciones('FuenteIngresos')}
              disposicion="lista"
              {...campo('ingresos_fuente')}
            />
            <OpcionesUnicas
              pregunta="¿Qué tan estable es tu fuente de ingresos?"
              opciones={opciones('EstabilidadIngresos')}
              disposicion="lista"
              {...campo('ingresos_estabilidad')}
            />
            <SiNo
              pregunta="¿A la hora de pagar arriendo/facturas podrías ser puntual?"
              etiquetaSi="Sí, siempre"
              etiquetaNo="A veces se me complica"
              {...campo('pagos_puntual')}
            />
          </div>
        </SeccionDimension>

        <SeccionDimension id="titulo-personalidad" numero={3} dimension={DIMENSIONES_ROOMIE[2]} Icono={Heart}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
              <h4 className="text-xs font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                Características Positivas (Fortalezas)
              </h4>
              <p className="text-[11px] text-emerald-700 mb-3">
                Selecciona las que mejor describan tu comportamiento diario:
              </p>
              <ChipsMultiples
                opciones={opciones('RasgoPositivo')}
                seleccionados={form.rasgos_positivos}
                onAlternar={(v) => toggleLista('rasgos_positivos', v)}
                tono="emerald"
              />
            </div>

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
              <ChipsMultiples
                opciones={opciones('RasgoNegativo')}
                seleccionados={form.rasgos_negativos}
                onAlternar={(v) => toggleLista('rasgos_negativos', v)}
                tono="amber"
              />
              <ErrorCampo mensaje={errores.rasgos_negativos} />
            </div>
          </div>
        </SeccionDimension>

        <SeccionDimension id="titulo-sueno" numero={4} dimension={DIMENSIONES_ROOMIE[3]} Icono={Moon}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <CampoHora
              id="hora_dormir"
              etiqueta="Hora habitual en que duermes"
              valor={form.sueno_hora_dormir}
              error={errores.sueno_hora_dormir}
              onCambiar={(v) => actualizarCampo('sueno_hora_dormir', v)}
            />
            <CampoHora
              id="hora_despertar"
              etiqueta="Hora habitual en que despiertas"
              valor={form.sueno_hora_despertar}
              error={errores.sueno_hora_despertar}
              onCambiar={(v) => actualizarCampo('sueno_hora_despertar', v)}
            />
            <OpcionesUnicas
              pregunta="¿Cómo describirías tu ritmo de sueño?"
              opciones={opciones('TipoHorarioSueno')}
              disposicion="lista"
              {...campo('sueno_tipo')}
            />
          </div>
        </SeccionDimension>

        <SeccionDimension id="titulo-convivencia" numero={5} dimension={DIMENSIONES_ROOMIE[4]} Icono={Users}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-navy-800 uppercase tracking-wider">
                Tus planes de vida
              </h4>
              <div className="space-y-2">
                <Casilla pregunta="¿Tienes pareja sentimental que planeas invitar?" {...casilla('invitados_pareja')} />
                <Casilla pregunta="¿Tienes mascotas o piensas llevar una?" {...casilla('mascotas')} />
                <Casilla
                  pregunta="¿Planeas recibir invitados o visitas en varias ocasiones?"
                  {...casilla('invitados_plan')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-navy-800 uppercase tracking-wider flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 text-navy-600" aria-hidden="true" />
                Tolerancia de Convivencia (Filtros duros de Match)
              </h4>
              <div className="space-y-2">
                <Casilla
                  pregunta="¿Aceptas convivir con mascotas de tu compañero?"
                  {...casilla('acepta_mascotas')}
                />
                <Casilla
                  pregunta="¿Aceptas que tu compañero invite a su pareja o amigos?"
                  {...casilla('acepta_invitados')}
                />
              </div>
              <p className="text-[11px] text-neutral-400 leading-tight">
                Nota: Si no aceptas mascotas o visitas, el motor de matching evitará emparejarte con
                quienes declaren tenerlas para prevenir roces.
              </p>
            </div>
          </div>
        </SeccionDimension>

        <BarraGuardado sucio={sucio} saving={saving} />
      </form>
    </div>
  )
}
