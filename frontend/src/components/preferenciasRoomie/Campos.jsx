import { Check, AlertCircle } from 'lucide-react'

const SELECCIONADO = 'border-navy-900 bg-navy-50 text-navy-900 font-bold ring-1 ring-navy-900'
const SIN_SELECCION = 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'

const DISPOSICIONES = {
  grid2: { contenedor: 'grid grid-cols-2 gap-2', boton: 'px-3 py-2.5 text-center min-h-[44px] flex items-center justify-center' },
  grid3: { contenedor: 'grid grid-cols-3 gap-2', boton: 'px-2 py-2 text-center min-h-[44px] flex items-center justify-center' },
  lista: { contenedor: 'flex flex-col gap-2', boton: 'px-3 py-2 text-left min-h-[40px] flex items-center' },
}

/** Pregunta de respuesta única: un botón por opción del catálogo. */
export function OpcionesUnicas({ pregunta, opciones, valor, onElegir, disposicion = 'grid2' }) {
  const estilo = DISPOSICIONES[disposicion]
  return (
    <div>
      <label className="block text-xs font-semibold text-navy-800 mb-2">{pregunta}</label>
      <div className={estilo.contenedor}>
        {opciones.map((opt) => (
          <button
            key={opt.valor}
            type="button"
            onClick={() => onElegir(opt.valor)}
            className={`${estilo.boton} rounded-xl text-xs font-medium border transition ${
              valor === opt.valor ? SELECCIONADO : SIN_SELECCION
            }`}
          >
            {opt.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}

const TONOS_SI_NO = {
  emerald: 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold ring-1 ring-emerald-600',
  amber: 'border-amber-600 bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-600',
}

/** Pregunta sí/no con dos botones (true en verde, false en ámbar). */
export function SiNo({ pregunta, valor, onElegir, etiquetaSi, etiquetaNo }) {
  const boton = (v, etiqueta, tono) => (
    <button
      type="button"
      onClick={() => onElegir(v)}
      className={`px-3 py-3 rounded-xl text-xs font-semibold border text-center transition min-h-[44px] flex items-center justify-center ${
        valor === v ? TONOS_SI_NO[tono] : SIN_SELECCION
      }`}
    >
      {etiqueta}
    </button>
  )
  return (
    <div>
      <label className="block text-xs font-semibold text-navy-800 mb-2">{pregunta}</label>
      <div className="grid grid-cols-2 gap-2">
        {boton(true, etiquetaSi, 'emerald')}
        {boton(false, etiquetaNo, 'amber')}
      </div>
    </div>
  )
}

const TONOS_CHIP = {
  emerald: {
    activo: 'border-emerald-600 bg-emerald-600 text-white font-bold',
    inactivo: 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100/50',
  },
  amber: {
    activo: 'border-amber-700 bg-amber-700 text-white font-bold',
    inactivo: 'border-amber-200 bg-white text-amber-900 hover:bg-amber-100/50',
  },
}

/** Selección múltiple en forma de chips. */
export function ChipsMultiples({ opciones, seleccionados, onAlternar, tono }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((opt) => {
        const activa = seleccionados.includes(opt.valor)
        return (
          <button
            key={opt.valor}
            type="button"
            onClick={() => onAlternar(opt.valor)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition min-h-[40px] flex items-center gap-1.5 ${
              activa ? TONOS_CHIP[tono].activo : TONOS_CHIP[tono].inactivo
            }`}
          >
            {activa && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            {opt.etiqueta}
          </button>
        )
      })}
    </div>
  )
}

/** Campo de hora (input type=time) con su error de validación. */
export function CampoHora({ id, etiqueta, valor, error, onCambiar }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-navy-800 mb-1.5">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type="time"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-navy-900 bg-white focus:border-navy-900 focus:outline-none min-h-[44px]"
        />
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

/** Casilla de verificación a ancho completo con la pregunta a la izquierda. */
export function Casilla({ pregunta, marcada, onCambiar }) {
  return (
    <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100/60 cursor-pointer min-h-[44px]">
      <span className="text-xs text-navy-900 font-medium">{pregunta}</span>
      <input
        type="checkbox"
        checked={marcada === true}
        onChange={(e) => onCambiar(e.target.checked)}
        className="w-4 h-4 rounded text-navy-900 focus:ring-navy-800"
      />
    </label>
  )
}

/** Tarjeta de una dimensión del cuestionario (título numerado + descripción). */
export function SeccionDimension({ id, numero, dimension, Icono, children }) {
  return (
    <section
      aria-labelledby={id}
      className="card rounded-2xl p-4 sm:p-6 bg-white border border-neutral-150 shadow-sm space-y-5"
    >
      <div className="border-b border-neutral-100 pb-3">
        <h3 id={id} className="text-sm sm:text-base font-bold text-navy-900 flex items-center gap-2">
          <Icono className="w-4 h-4 text-navy-700" aria-hidden="true" />
          {numero}. {dimension.titulo}
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">{dimension.descripcion}</p>
      </div>
      {children}
    </section>
  )
}

export function ErrorCampo({ mensaje }) {
  if (!mensaje) return null
  return (
    <p className="text-xs text-red-600 font-semibold mt-2 flex items-center gap-1">
      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
      {mensaje}
    </p>
  )
}
