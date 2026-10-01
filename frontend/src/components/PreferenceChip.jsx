// PreferenceChip — Chip ilustrado de selección (F1, adiós stickers).
// Estructura: Icono vectorial + título + estado activo/inactivo con
// transición GPU (transform/opacity; el anillo usa box-shadow, sin layout).
// Activo: borde navy + ring + fondo navy-50 + check. Inactivo: neutro.
// Uso: <PreferenceChip icono="mascotas" titulo="Tengo mascota" hint="..."
//        activa={bool} onToggle={() => ...} /> (a11y: aria-pressed).
import Icono from './Icono'

// Sin atributo `title`: en táctil no existe hover y duplicaba el nombre
// accesible; el `hint` vive en el subtítulo de la sección (visible siempre).
export default function PreferenceChip({ icono, titulo, hint, activa, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!!activa}
      aria-label={hint ? `${titulo}. ${hint}` : titulo}
      className={`inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-2xl border text-[13px] font-semibold transition-all duration-150 active:scale-[0.97] ${
        activa
          ? 'border-navy-800 ring-2 ring-navy-800/25 bg-navy-50 text-navy-900 shadow-sm'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-navy-300 hover:text-navy-800 hover:shadow-sm'
      }`}
    >
      <span aria-hidden="true" className={activa ? 'text-navy-800' : 'text-neutral-500'}>
        <Icono nombre={icono} className="w-5 h-5" />
      </span>
      {titulo}
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold transition-opacity duration-150 ${
          activa ? 'bg-navy-800 text-white opacity-100' : 'bg-transparent text-transparent opacity-0'
        }`}
      >
        ✓
      </span>
    </button>
  )
}
